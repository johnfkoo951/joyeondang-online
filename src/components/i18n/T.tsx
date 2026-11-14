// 두 말을 함께 싣는 글(서버 화면에서도 쓴다). 고른 말만 보이는 것은 CSS가 한다(globals.css의 [data-ko]/[data-en]):
// 그리기 전에 BOOT가 <html data-lang>을 붙이므로 깜박임이 없다. 속성(aria-label, placeholder, title)이나 <option>, 캔버스 글에는
// 쓸 수 없다: 그런 자리는 useLang/useTr로 고른다.
export function T({ ko, en }: { ko: React.ReactNode; en: React.ReactNode }) {
  return (
    <>
      <span data-ko="">{ko}</span>
      <span data-en="" lang="en">{en}</span>
    </>
  );
}
