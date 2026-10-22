// 지도 무대 고르기: 지도(MapLibre, 키 없는 무료 타일 OpenFreeMap)에서 바지선·관람석·지상 틀 자리를 찍고,
// 화면에 보이는 건물 높이로 스카이라인을 만든다. 실제 불꽃 발사 계획용이 아니다.
// 지도 코드는 크기가 커서 이 창을 처음 열 때 받아 온다.

import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
// 지도 작업자(worker)는 Vite가 따로 묶어 주소를 준다 (배포판에서도 찾을 수 있게).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { SAFETY_RADIUS, buildMapVenue, localToGeo, type MapPick, type MapVenue, type Show, type Size } from '@nss/engine';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
type Mode = 'barge' | 'seat' | 'frame' | 'erase';

export interface MapResult {
  venue: MapVenue;
  launchers: ReturnType<typeof buildMapVenue>['launchers'];
}

/** 원 하나를 지도 위 다각형으로 (반지름 m) */
function circle(lat: number, lon: number, r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k <= 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    out.push([lon + (r * Math.sin(a)) / (111_320 * Math.cos((lat * Math.PI) / 180)), lat + (r * Math.cos(a)) / 110_540]);
  }
  return out;
}

export class MapStage {
  private dialog: HTMLDialogElement;
  private map: maplibregl.Map;
  private mode: Mode = 'barge';
  private barges: [number, number][] = [];
  private seats: [number, number][] = [];
  private frame: [number, number] | null = null;
  private markers: maplibregl.Marker[] = [];
  private bigSize: Size = 10;
  private resolve: ((r: MapResult | null) => void) | null = null;

  constructor(dialog: HTMLDialogElement) {
    this.dialog = dialog;
    maplibregl.setWorkerUrl(workerUrl);
    this.map = new maplibregl.Map({
      container: dialog.querySelector<HTMLElement>('#map-view')!,
      style: STYLE,
      center: [126.933, 37.521],
      zoom: 14,
      attributionControl: { compact: true },
    });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    this.map.on('load', () => {
      this.map.addSource('safety', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      this.map.addLayer({ id: 'safety-fill', type: 'fill', source: 'safety', paint: { 'fill-color': '#f87171', 'fill-opacity': 0.12 } });
      this.map.addLayer({ id: 'safety-line', type: 'line', source: 'safety', paint: { 'line-color': '#f87171', 'line-dasharray': [2, 2] } });
      this.redraw();
    });
    this.map.on('click', (e) => {
      const p: [number, number] = [e.lngLat.lat, e.lngLat.lng];
      if (this.mode === 'barge') this.barges.push(p);
      else if (this.mode === 'seat') this.seats.push(p);
      else if (this.mode === 'frame') this.frame = p;
      this.redraw();
    });
    dialog.querySelectorAll<HTMLButtonElement>('[data-map-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        this.mode = b.dataset.mapMode as Mode;
        dialog.querySelectorAll('[data-map-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      }),
    );
    dialog.querySelector('#map-clear')!.addEventListener('click', () => {
      this.barges = [];
      this.seats = [];
      this.frame = null;
      this.redraw();
    });
    dialog.querySelector('#map-make')!.addEventListener('click', () => this.make());
    dialog.addEventListener('close', () => {
      this.resolve?.(null);
      this.resolve = null;
    });
  }

  /** 창을 연다. 지금 쇼가 지도 무대면 그 자리들을 다시 보여 준다. */
  pick(show: Show): Promise<MapResult | null> {
    const mv = show.venue.map;
    this.bigSize = (Math.max(3, ...show.cues.map((c) => c.size)) as Size) ?? 10;
    if (show.venue.preset === 'map' && mv) {
      this.barges = show.launchers.filter((l) => l.kind === 'barge').map((l) => localToGeo(mv, l.pos[0], l.pos[2]));
      const f = show.launchers.find((l) => l.kind === 'frame');
      this.frame = f ? localToGeo(mv, f.pos[0], f.pos[2]) : null;
      this.seats = mv.seats.map((s) => localToGeo(mv, s.x, s.z));
      (this.dialog.querySelector('#map-name') as HTMLInputElement).value = mv.name;
      this.map.jumpTo({ center: [mv.lon, mv.lat], zoom: 14.5 });
    }
    this.dialog.showModal();
    // 숨겨져 있던 지도는 크기를 다시 재야 한다.
    requestAnimationFrame(() => this.map.resize());
    this.redraw();
    return new Promise((res) => (this.resolve = res));
  }

  private redraw(): void {
    for (const m of this.markers) m.remove();
    this.markers = [];
    const add = (p: [number, number], text: string, cls: string, remove: () => void) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `map-pin ${cls}`;
      el.textContent = text;
      el.addEventListener('click', (ev) => {
        if (this.mode !== 'erase') return;
        ev.stopPropagation();
        remove();
        this.redraw();
      });
      this.markers.push(new maplibregl.Marker({ element: el }).setLngLat([p[1], p[0]]).addTo(this.map));
    };
    this.barges.forEach((p, i) => add(p, `바지선 ${i + 1}`, 'barge', () => this.barges.splice(i, 1)));
    this.seats.forEach((p, i) => add(p, i === 0 ? '관람석 1 (정면)' : `관람석 ${i + 1}`, 'seat', () => this.seats.splice(i, 1)));
    if (this.frame) add(this.frame, '지상 틀', 'frame', () => (this.frame = null));
    const src = this.map.getSource('safety') as maplibregl.GeoJSONSource | undefined;
    src?.setData({
      type: 'FeatureCollection',
      features: this.barges.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circle(p[0], p[1], SAFETY_RADIUS[this.bigSize])] } })),
    });
    this.dialog.querySelector('#map-status')!.textContent =
      `바지선 ${this.barges.length}곳 · 관람석 ${this.seats.length}곳${this.frame ? ' · 지상 틀' : ''}. 붉은 원은 이 쇼의 가장 큰 알(${this.bigSize}호) 안전거리 ${SAFETY_RADIUS[this.bigSize]}m입니다.`;
  }

  /** 지금 화면에 그려진 건물 (높이가 있는 것) */
  private buildings(): MapPick['buildings'] {
    const out: MapPick['buildings'] = [];
    for (const f of this.map.queryRenderedFeatures()) {
      if (f.sourceLayer !== 'building') continue;
      const h = Number(f.properties?.render_height ?? f.properties?.height ?? 0);
      if (!(h > 0)) continue;
      const g = f.geometry;
      const ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : null;
      if (ring) out.push({ ring: (ring as number[][]).map(([lon, lat]) => [lat, lon] as [number, number]), height: h });
      if (out.length > 3000) break;
    }
    return out;
  }

  private make(): void {
    const status = this.dialog.querySelector('#map-status')!;
    try {
      const name = (this.dialog.querySelector('#map-name') as HTMLInputElement).value.trim();
      const result = buildMapVenue({
        name,
        barges: this.barges,
        seats: this.seats.map((at, i) => ({ label: i === 0 ? `${name || '지도'} 정면` : `관람석 ${i + 1}`, at })),
        ...(this.frame ? { frame: this.frame } : {}),
        buildings: this.buildings(),
      });
      const r = this.resolve;
      this.resolve = null;
      this.dialog.close();
      r?.(result);
    } catch (err) {
      status.textContent = (err as Error).message;
    }
  }
}
