'use client';
import { useEffect, useState } from 'react';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { showInstall } from '@/lib/pwa';
import { InstallButton } from './InstallButton';
import { useInstallMode } from './pwa-store';

// 첫 화면의 작은 권유: 휴대폰에서 볼 때만, 홈 화면에 둘 수 있을 때만. 닫으면 이 기기에서는 다시 보이지 않는다.
// 앱 안 브라우저(카카오톡 등)는 첫 화면이 따로 「바깥 브라우저로」를 권하므로 여기서는 뺀다.
const KEY = 'jy.installHint';

export function HomeInstallHint() {
  const mode = useInstallMode();
  const t = useTr();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let v: string | null = null;
    try {
      v = localStorage.getItem(KEY);
    } catch {
      v = null;
    }
    queueMicrotask(() => setHidden(v === 'hidden'));
  }, []);

  if (hidden || !showInstall(mode) || mode === 'inapp') return null;
  return (
    <aside className="card" aria-label={t('홈 화면에 추가', 'Add to Home Screen')} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
      <p style={{ margin: 0, flex: '1 1 220px' }}>
        <strong>
          <T ko="휴대폰 홈 화면에 조연당을 두세요." en="Keep Joyeondang on your home screen." />
        </strong>{' '}
        <span className="muted">
          <T ko="아이콘 하나로 바로 집 안에 들어오고, 화면을 넓게 써요." en="One tap takes you into the house, full screen." />
        </span>
      </p>
      <div className="btn-row">
        <InstallButton className="btn btn-roof" />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(KEY, 'hidden');
            } catch {
              // 저장이 막혀 있으면 이번 방문만 숨긴다
            }
          }}
        >
          <T ko="괜찮아요" en="No thanks" />
        </button>
      </div>
    </aside>
  );
}
