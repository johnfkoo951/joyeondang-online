'use client';
import { useEffect, useState, type ComponentProps, type ComponentType } from 'react';
import { T } from '@/components/i18n/T';
import type { CharacterPanel } from './CharacterPanel';

type Props = ComponentProps<typeof CharacterPanel>;

// 캐릭터 꾸미기 패널은 three.js로 미리보기를 그린다. 열 때 받아 와서, 걷기 화면이 처음 받는 코드에서 three.js를 뺀다
// (three.js는 3D 장면과 함께 따로 온다. 패널을 열 때는 보통 이미 와 있다). 못 받으면 새로 고침을 권한다.
export function CharacterPanelLazy(props: Props) {
  const [Panel, setPanel] = useState<ComponentType<Props> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let off = false;
    import('./CharacterPanel').then(
      (m) => { if (!off) setPanel(() => m.CharacterPanel); },
      () => { if (!off) setFailed(true); },
    );
    return () => {
      off = true;
    };
  }, []);
  if (Panel) return <Panel {...props} />;
  // 받는 동안에도 걷기는 멈춰 있다: 빈 화면 대신 받는 중임을 보인다
  if (!failed) return <p className="walk-center walk-card" role="status"><T ko="캐릭터 꾸미기를 여는 중이에요" en="Opening the character panel" /></p>;
  return (
    <div className="walk-center walk-card" role="alert">
      <p><T ko="캐릭터 꾸미기를 받지 못했어요. 새로 고침하면 열려요." en="Couldn't load the character panel. Refresh the page to open it." /></p>
      <div className="btn-row">
        <button type="button" className="btn btn-pine" onClick={() => window.location.reload()}><T ko="새로 고침" en="Refresh" /></button>
        <button type="button" className="btn" onClick={props.onClose}><T ko="닫기" en="Close" /></button>
      </div>
    </div>
  );
}
