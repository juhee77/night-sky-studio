package studio.nightsky.server.account;

/** 계정을 지울 때 다른 곳(클라우드·상영관)에 있는 그 계정의 것도 지운다. */
public interface AccountData {
    void deleteAll(Long accountId);
}
