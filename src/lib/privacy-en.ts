// 개인정보 화면(/privacy)이 다른 파일에서 가져와 끼우는 한국어 문장의 영어. 한국어 정본은 그 파일들에 있고
// (lib/shots-pick SHOTS_PRIVACY_LINE, lib/avatar/admin-care ADMIN_CARE_LINE, lib/avatar/consent CONSENT_ARCHIVE·privacyModel),
// 여기는 뜻을 그대로 옮긴 글만 둔다(덧붙이거나 줄이지 않는다). 한국어가 바뀌면 시험(tests/unit/i18n-entry.test.ts)이
// 옮긴 때의 한국어(시험 안에 적어 둔 것)와 견주어 알려 준다: 그때 여기 영어도 함께 고친다.
// 다른 파일을 가져오지 않는다(시험이 바로 부른다). 영어와 한국어가 다르면 한국어가 기준이다(화면에도 그렇게 적는다).

export type ModelProviderName = 'meshy' | 'trellis';

/** SHOTS_PRIVACY_LINE의 영어 */
export const SHOTS_PRIVACY_LINE_EN =
  "Only you can see them. The host doesn't look at the photos, but can delete them all at once by person or by event if needed.";

/** ADMIN_CARE_LINE의 영어 */
export const ADMIN_CARE_LINE_EN =
  'On the admin screen, the host can see every photo character together with the guest list name, the name tag, and whether it is being worn right now. '
  + 'Attempts that are still drawing or failed to draw, and refused attempts with their reason, are shown too. If something is wrong, the host deletes or remakes the character or 3D. '
  + 'When a picture is redrawn, the original photo is sent again to the outside AI service (OpenAI). If a redraw is refused, that character and the original photo are deleted; '
  + 'if it can\'t be drawn, the original picture stays but the original photo is deleted. A 3D is sent to the outside service only if you asked the outside service for a 3D of that picture yourself, '
  + 'or the host confirmed that you said it was okay. The original photo is not shown on the admin screen.';

/** CONSENT_ARCHIVE의 영어 */
export const CONSENT_ARCHIVE_PRIVACY_EN =
  "As a record of Joyeondang, the host keeps copies of the original photo, character pictures and 3D model in an archive on the host's computer. "
  + 'The archive is not shown outside, and anything you delete here is also deleted from the archive at the next cleanup.';

/** meshyTraining(optOut)의 영어 */
export function meshyTrainingEn(optOut = false): string {
  return optOut
    ? "We have asked Meshy not to use the pictures it receives for training, and Meshy's copy is deleted when it is done."
    : "Under Meshy's terms, the pictures it receives may be used for training, and Meshy's copy is deleted when it is done.";
}

/** privacyModel(provider, optOut)의 영어 */
export function privacyModelEn(provider: ModelProviderName, optOut = false): string {
  return provider === 'trellis'
    ? 'You can make a 3D model from one character picture you choose among those you saved with ★ (it is made on our own computer and not sent to any outside service).'
    : 'You can make a 3D model from one character picture you choose among those you saved with ★. That one chosen character picture is sent to an outside service (Meshy, USA) to make the 3D (your original photo is not sent). '
      + meshyTrainingEn(optOut);
}
