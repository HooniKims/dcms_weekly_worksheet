import { Eye, EyeSlash, LockKey } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";

type LockScreenProps = Readonly<{
  onUnlock: (password: string) => Promise<void>;
  showDemoHint: boolean;
}>;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message === "wrong-password") {
    return "비밀번호가 맞지 않습니다.";
  }
  return "접속할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.";
}

export function LockScreen({ onUnlock, showDemoHint }: LockScreenProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (password.length === 0) return;
    setStatus("submitting");
    setError("");
    try {
      await onUnlock(password);
    } catch (caught) {
      setError(errorMessage(caught));
      setStatus("idle");
    }
  }

  return (
    <main className="lock-page">
      <section className="lock-copy" aria-labelledby="lock-title">
        <img
          className="school-brand-mark"
          src="/deungchon-logo.png"
          alt="등촌중학교 교표"
          width="478"
          height="478"
          fetchPriority="high"
        />
        <p className="eyebrow">WEEKLY WORK</p>
        <h1 id="lock-title">
          등촌중학교
          <br />
          <span className="headline-phrase">주간업무 추진사항</span>
          <br />
          <em className="headline-phrase">수합 사이트</em>
        </h1>
        <p className="lock-description">
          부서별 추진사항을 작성하고 함께 확인하는 교직원 업무 공간입니다.
        </p>
      </section>

      <section className="lock-card" aria-label="사이트 접속">
        <span className="lock-icon" aria-hidden="true">
          <LockKey size={22} />
        </span>
        <p className="card-kicker">내부 업무 공간</p>
        <p className="card-help">공용 비밀번호를 입력하면 바로 시작할 수 있습니다.</p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="shared-password">공용 비밀번호</label>
          <div className="password-field">
            <input
              id="shared-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
            <button
              className="icon-button"
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
            >
              {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {error.length > 0 && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {showDemoHint && (
            <p className="demo-hint">
              개발 미리보기 비밀번호: {import.meta.env.VITE_LOCAL_SITE_PASSWORD}
            </p>
          )}
          <button className="primary-button wide" type="submit" disabled={status === "submitting"}>
            {status === "submitting" ? "확인하는 중…" : "업무 화면 열기"}
          </button>
        </form>
        <p className="privacy-note">입력한 내용은 학교 내부 업무용으로만 사용됩니다.</p>
      </section>
    </main>
  );
}
