// 사람이 지은 글(이름, 행사 이름표)을 화면에 둘 때의 lang. 옮기지 않는 글이라, 한글이 있으면 화면 읽기가 한국어로 읽게
// lang="ko"를 붙이고, 한글이 없으면(로마자 이름 등) 정하지 않아 둘레 말을 따르게 한다.
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;

export function nameLang(text: string | null | undefined): 'ko' | undefined {
  return typeof text === 'string' && HANGUL.test(text) ? 'ko' : undefined;
}
