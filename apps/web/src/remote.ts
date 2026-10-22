// 서버판 연결: VITE_API_URL이 있을 때만 쓴다. 없으면(정적판) 서버 메뉴가 보이지 않는다.
// 짧은 공유 링크, 계정(가입·로그인), 쇼와 내 불꽃 클라우드 저장.

export const API_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const remoteEnabled = (): boolean => API_URL !== '';

const AUTH = 'nss:auth';

export interface Auth {
  token: string;
  name: string;
}

export function currentAuth(): Auth | null {
  try {
    return JSON.parse(localStorage.getItem(AUTH) ?? 'null') as Auth | null;
  } catch {
    return null;
  }
}

function setAuth(a: Auth | null): void {
  try {
    if (a) localStorage.setItem(AUTH, JSON.stringify(a));
    else localStorage.removeItem(AUTH);
  } catch {
    // 저장소를 못 쓰면 이번 창에서만 로그인된다.
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const auth = currentAuth();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('서버에 연결하지 못했습니다. 잠시 뒤 다시 해 보세요.');
  }
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (res.status === 401 && auth) setAuth(null);
  if (!res.ok) throw new Error(data.message ?? `서버 오류 (${res.status})`);
  return data;
}

export async function signup(name: string, password: string): Promise<Auth> {
  const a = await call<Auth>('POST', '/api/auth/signup', { name, password });
  setAuth(a);
  return a;
}

export async function login(name: string, password: string): Promise<Auth> {
  const a = await call<Auth>('POST', '/api/auth/login', { name, password });
  setAuth(a);
  return a;
}

export async function logout(): Promise<void> {
  await call('POST', '/api/auth/logout').catch(() => {});
  setAuth(null);
}

/** 쇼를 줄인 글자(#s= 뒤)를 짧은 글자로 */
export async function shortLink(data: string): Promise<string> {
  return (await call<{ code: string }>('POST', '/api/links', { data })).code;
}

export async function openLink(code: string): Promise<string> {
  return (await call<{ data: string }>('GET', `/api/links/${encodeURIComponent(code)}`)).data;
}

export type CloudKind = 'shows' | 'shells';

export interface CloudSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

export const cloudList = (kind: CloudKind) => call<CloudSummary[]>('GET', `/api/${kind}`);
export const cloudGet = (kind: CloudKind, id: string) => call<{ id: string; title: string; data: string }>('GET', `/api/${kind}/${encodeURIComponent(id)}`);
export const cloudPut = (kind: CloudKind, id: string, title: string, data: string) =>
  call<{ id: string }>('PUT', `/api/${kind}/${encodeURIComponent(id)}`, { title, data });
export const cloudDelete = (kind: CloudKind, id: string) => call('DELETE', `/api/${kind}/${encodeURIComponent(id)}`);

// ── 상영관 갤러리 ──
export type GalleryKind = 'show' | 'shell';

export interface GalleryItem {
  id: number;
  kind: GalleryKind;
  title: string;
  author: string;
  likes: number;
  liked: boolean;
  mine: boolean;
  createdAt: string;
}

export const galleryList = (kind: GalleryKind, sort: 'new' | 'top') => call<GalleryItem[]>('GET', `/api/gallery?kind=${kind}&sort=${sort}`);
export const galleryGet = (id: number) => call<{ item: GalleryItem; data: string }>('GET', `/api/gallery/${id}`);
export const galleryUpload = (kind: GalleryKind, title: string, data: string) => call<{ id: number }>('POST', '/api/gallery', { kind, title, data });
export const galleryLike = (id: number) => call<{ likes: number; liked: boolean }>('POST', `/api/gallery/${id}/like`);
export const galleryReport = (id: number) => call<{ hidden: boolean }>('POST', `/api/gallery/${id}/report`);
export const galleryDelete = (id: number) => call('DELETE', `/api/gallery/${id}`);

/** 계정 지우기: 클라우드에 저장한 것과 상영관에 올린 것까지 모두 */
export async function deleteAccount(): Promise<void> {
  await call('DELETE', '/api/auth/me');
  setAuth(null);
}
