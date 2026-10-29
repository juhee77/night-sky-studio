package studio.nightsky.server.funnel;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;

/** 단계별 열기의 한 단계에 도달한 브라우저 수. 누가 도달했는지는 남기지 않고 숫자만 센다. */
@Entity
public class StepCount {
    @Id
    @Column(length = 24)
    private String step;

    private long reached;

    protected StepCount() {}

    public StepCount(String step) {
        this.step = step;
    }

    public String getStep() {
        return step;
    }

    public long getReached() {
        return reached;
    }

    void add() {
        reached++;
    }
}
