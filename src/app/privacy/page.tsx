import type { Metadata } from 'next';
import { SHOTS_PRIVACY_LINE } from '@/lib/shots-pick';
import { ReceiptForm } from '@/components/JoinForms';
import { T } from '@/components/i18n/T';
import { ADMIN_CARE_LINE } from '@/lib/avatar/admin-care';
import { CONSENT_ARCHIVE, privacyModel } from '@/lib/avatar/consent';
import { meshyTrainingOptOut, modelProvider } from '@/lib/avatar/server';
import { ADMIN_CARE_LINE_EN, CONSENT_ARCHIVE_PRIVACY_EN, SHOTS_PRIVACY_LINE_EN, privacyModelEn } from '@/lib/privacy-en';

export const metadata: Metadata = { title: '무엇을 받고 어떻게 지우는지' };

// 개인정보 처리 안내 한 장(기획서 10절 13). 보존 기간은 가족 결정 대기라 확정 문장만 쓴다.
// 3D 모형을 어디서 만드는지는 환경 변수 AVATAR_MODEL_PROVIDER(meshy | trellis)를 따른다(동의 글과 같은 곳에서 고른다).
// Meshy가 받은 그림을 학습에 쓰는지는 MESHY_TRAINING_OPTOUT을 따른다(같은 글).
// 영어 화면: 같은 내용을 그대로 옮긴 목록을 한국어 목록 옆에 두고 CSS가 고른 말의 목록만 보인다(data-ko / data-en).
// 다른 파일에서 끼우는 문장의 영어는 lib/privacy-en.ts. 영어와 한국어가 다르면 한국어가 기준이다(화면에도 적는다).
export default function PrivacyPage() {
  const provider = modelProvider();
  const optOut = meshyTrainingOptOut();
  return (
    <div className="wrap stack">
      <h1><T ko="무엇을 받고 어떻게 지우는지" en="What we collect and how to delete it" /></h1>
      <p className="lead">
        <T
          ko="조연당 온라인은 가족이 손님을 맞으려고 만든 작은 집 기록이에요. 꼭 필요한 것만 받아요."
          en="Joyeondang Online is a small record of our home, made by our family to welcome guests. We take only what is truly needed."
        />
      </p>
      <p className="small muted" data-en="" lang="en">
        This page is translated from Korean. If the English and the Korean differ, the Korean version is the reference.
      </p>

      <h2><T ko="받는 것" en="What we collect" /></h2>
      <ul className="stack" data-ko="">
        <li>구글 계정의 이메일 주소: 초대 명단과 맞춰 보는 데만 써요. 화면에는 보이지 않아요.</li>
        <li>구글 계정 이름(행사 초대 코드로 들어온 경우만): 명단 이름으로 적어요. 이름표를 따로 정하기 전까지 쪽지와 함께 걷기에서 다른 손님에게 이 이름이 보여요. 구글 계정에 이름이 없으면 이메일의 @ 앞부분을 대신 써요. 수첩의 이름표에서 언제든 바꿀 수 있고, 바꾸면 그 뒤에 쓰는 글부터 새 이름으로 보여요. 이미 쓴 대화·쪽지와 명단 이름은 그대로 남아요(명단 이름은 집주인에게 고쳐 달라고 할 수 있어요).</li>
        <li>이름표에 쓴 이름, 고른 종이 인형과 색, 사진 표시 선택(나와도 괜찮아요 / 나오고 싶지 않아요)</li>
        <li>남긴 종이와 고른 공개 범위, 받은 도장(현장 QR 도장 포함)</li>
        <li>걷기 화면에서 한 말(초대 손님이 로그인한 경우): 대화창에 쓴 글과 Enter로 띄운 말풍선, 누구를 멘션했는지, 그때 집 안이었는지 어느 방이었는지, 쓴 때의 이름표와 캐릭터 모습. 지울 때까지 남겨요.</li>
        <li>집 안에서 걸은 길(초대 손님이 로그인한 경우): 실제 집과 방 안을 걷는 동안, 움직일 때만 1초에 한 번 내 캐릭터의 자리와 바라보는 방향, 그 공간과 시각. 30초마다, 그리고 걷기 화면을 떠날 때 보내요. 지울 때까지 남겨요.</li>
        <li>걷기 화면에서 찍은 사진(로그인한 경우만): 찍은 화면과 찍은 곳(걷기 화면에 보이는 방 이름), 찍은 때를 내 갤러리에 60장까지 둬요. 로그인하지 않고 찍은 사진은 그 기기에 바로 내려받아지고 보내지 않아요.</li>
        <li>쪽지에 붙인 사진(소나무와 포토존에서, 직접 붙인 경우만): 휴대폰이 보내기 전에 사진을 다시 그려 위치·기기·찍은 시각 정보를 지우고, 보기용과 작은 그림 두 장만 보내요. 원래 파일과 파일 이름은 보내지 않아요. 서버가 한 번 더 확인해 그런 정보가 남은 파일은 받지 않아요. 「사람이 나와요」「아이가 나와요」 표시도 함께 받아요.</li>
        <li>캐릭터 사진(직접 올린 경우만): 동의한 뒤 올린 내 사진, 그 사진으로 만든 캐릭터 그림, 그 그림을 보고 한 번 더 그린 여러 방향 그림(앞, 옆, 뒤). 캐릭터 그림을 만드는 동안에는 사진이 외부 AI 서비스(OpenAI)로 보내져요. 여러 방향 그림을 그리는 동안에는 캐릭터 그림과, 그것으로 그린 여러 방향 그림이 같은 서비스로 보내져 방향을 살펴요(잘 안 되면 몇 번 다시 해요). 원본 사진은 내가 지울 때까지 보관돼요. 만든 캐릭터 그림은 내가 지울 때까지 이력에 남아요. {privacyModel(provider, optOut)} 3D 모형도 로그인한 초대 손님에게만 보이고, 그림을 지우면 함께 지워져요. 만 14세 미만 아이의 사진은 보호자가 동의할 때만 받아요(올릴 때 「아이예요」를 고르고 보호자 동의에 체크하면 그 때를 함께 적어요).</li>
      </ul>
      <ul className="stack" data-en="" lang="en">
        <li>The email address of your Google account: used only to match you with the guest list. It is not shown on screen.</li>
        <li>The name on your Google account (only if you came in with an event invite code): we write it as your name on the guest list. Until you set a name tag of your own, other guests see this name on your notes and when walking together. If your Google account has no name, we use the part of your email before the @ instead. You can change it any time with the name tag in your notebook, and anything you write after that shows the new name. Chat messages and notes you already wrote, and your name on the guest list, stay as they are (you can ask the host to correct your name on the guest list).</li>
        <li>The name you write on your name tag, the paper doll and color you chose, and your photo preference (fine to appear / prefer not to appear)</li>
        <li>The notes you leave and the scope you choose for them, and the stamps you get (including on-site QR stamps)</li>
        <li>What you say on the walk screen (when an invited guest is signed in): messages typed in the chat window and speech bubbles posted with Enter, who you mentioned, whether you were in the house and which room, and your name tag and character look at the time. We keep it until it is deleted.</li>
        <li>The path you walk in the house (when an invited guest is signed in): while you walk through the real house and its rooms, once a second and only while you move, your character&apos;s position and facing direction, the space, and the time. It is sent every 30 seconds and when you leave the walk screen. We keep it until it is deleted.</li>
        <li>Photos you take on the walk screen (only when signed in): the captured screen, where it was taken (the room name shown on the walk screen) and when, up to 60 photos in your gallery. Photos taken without signing in are downloaded straight to that device and are not sent.</li>
        <li>Photos attached to notes (at the pine tree and the photo spot, only if you attach one yourself): before sending, your phone redraws the photo to remove location, device and capture time information, and sends only two images, one for viewing and one small thumbnail. The original file and its file name are not sent. The server checks once more and refuses any file that still has such information. We also receive the &ldquo;a person appears&rdquo; and &ldquo;a child appears&rdquo; marks.</li>
        <li>Character photos (only if you upload one yourself): your photo uploaded after you agree, the character picture made from it, and the pictures from several angles (front, side, back) drawn again from that picture. While the character picture is being made, the photo is sent to an outside AI service (OpenAI). While the angle pictures are being drawn, the character picture and the angle pictures drawn from it are sent to the same service to check the angles (if it doesn&apos;t work well, it tries a few more times). Your original photo is kept until you delete it. Character pictures you made stay in your history until you delete them. {privacyModelEn(provider, optOut)} The 3D model, too, is visible only to signed-in invited guests, and it is deleted along with the picture. Photos of children under 14 are accepted only with a guardian&apos;s consent (when uploading, choose &ldquo;A child&rdquo; and tick the guardian consent box, and we record that time as well).</li>
      </ul>

      <h2><T ko="받지 않는 것" en="What we don't collect" /></h2>
      <ul className="stack" data-ko="">
        <li>전화번호, 주소 같은 연락처</li>
        <li>휴대폰의 실제 위치(GPS 등). 위치 권한을 묻지 않아요. 걸은 길은 그림 속 집 안에서 캐릭터가 지나간 자리일 뿐이에요. 현장 QR도 어느 방의 표식인지만 보고 위치는 묻지 않아요.</li>
        <li>지금 누가 접속해 있는지의 목록. 접속자 목록은 화면에 그때그때 보일 뿐 저장하지 않아요(컨트롤 룸 녹화 영상에는 그때 화면에 있던 이름표가 담겨요. 아래 「누가 보나요」).</li>
      </ul>
      <ul className="stack" data-en="" lang="en">
        <li>Contact details such as phone numbers and addresses</li>
        <li>Your phone&apos;s real location (GPS and the like). We don&apos;t ask for location permission. The path you walk is only where your character went inside the house in the pictures. On-site QR codes, too, only tell us which room&apos;s mark they are and don&apos;t ask for your location.</li>
        <li>A list of who is online right now. The list of people here is only shown on screen at the moment and is not saved (a control room recording does contain the name tags that were on screen at the time; see &ldquo;Who sees it&rdquo; below).</li>
      </ul>

      <h2><T ko="누가 보나요" en="Who sees it" /></h2>
      <ul className="stack" data-ko="">
        <li>새 종이는 쓴 사람과 가족에게 먼저 보이고, 가족이 읽은 뒤 쓴 사람이 고른 범위까지만 걸려요.</li>
        <li>인터넷 누구나 보는 범위는 쓴 사람이 동의하고 가족이 한 장씩 승인한 것만이에요.</li>
        <li>「나만」으로 남긴 종이는 가족도 읽지 않아요.</li>
        <li>대화창에 쓴 글과 접속자 목록(이름표, 캐릭터 그림, 집 안인지 어느 방인지)은 로그인한 초대 손님 모두에게 보여요. 1:1 대화는 없고, 멘션한 글도 모두가 보는 대화에 남아요.</li>
        <li>Enter로 띄운 말풍선은 그때 같은 공간에 있던 사람에게 머리 위로 보여요. 기록은 남기지만 대화 이력에서는 쓴 사람과 가족·집주인만 볼 수 있어요.</li>
        <li>걸은 길 기록은 가족과 집주인만 볼 수 있어요. 행사를 돌아보거나 다시 볼 때 써요. 다른 손님에게는 보이지 않아요.</li>
        <li>걷기 사진은 {SHOTS_PRIVACY_LINE} 집주인 화면에는 사람마다 몇 장인지만 보여요.</li>
        <li>가족과 집주인은 컨트롤 룸에서 집 안 여러 곳의 모습(캐릭터, 이름표, 말풍선과 대화)을 실시간으로 볼 수 있어요. 지켜보는 사람은 접속자 목록에 나오지 않아요. 행사 기록으로 그 화면을 영상으로 녹화할 수 있고, 영상은 녹화한 컴퓨터에 파일로만 남아요(사이트에는 올리지 않아요).</li>
        <li>캐릭터 그림과 여러 방향 그림은 로그인한 초대 손님에게만 보여요. 사이트에서 원본 사진은 나만 볼 수 있어요.</li>
        <li>{CONSENT_ARCHIVE}</li>
        <li>{ADMIN_CARE_LINE}</li>
        <li>쪽지에 붙인 사진은 지금은 올린 분과 가족에게만 보여요. 공개 범위를 넓게 골라도 사진이 붙은 종이는 가족 범위까지만 걸려요. 사진은 비공개 저장소에 무작위 이름으로 두고, 볼 수 있는 분의 화면에만 10분 동안 열리는 짧은 주소로 보여 줘요.</li>
      </ul>
      <ul className="stack" data-en="" lang="en">
        <li>A new note is first shown to its writer and the family, and after the family reads it, it goes up only as far as the scope the writer chose.</li>
        <li>Only notes the writer agreed to share and the family approved one by one are visible to anyone online.</li>
        <li>Notes left as &ldquo;Only me&rdquo; are not read even by the family.</li>
        <li>Messages in the chat window and the list of people here (name tag, character picture, whether in the house and which room) are visible to all signed-in invited guests. There are no one-to-one chats, and messages with mentions also stay in the chat everyone sees.</li>
        <li>Speech bubbles posted with Enter appear above your head to the people in the same space at that moment. They are recorded, but in the chat history only the writer, the family and the host can see them.</li>
        <li>Only the family and the host can see the record of paths walked. It is used to look back on or replay the event. Other guests can&apos;t see it.</li>
        <li>Walk photos: {SHOTS_PRIVACY_LINE_EN} The host&apos;s screen shows only how many photos each person has.</li>
        <li>The family and the host can watch several places in the house live (characters, name tags, speech bubbles and chat) from the control room. People watching don&apos;t appear in the list of people here. As a record of the event, that screen can be recorded as a video, and the video stays only as a file on the computer that recorded it (it is not uploaded to the site).</li>
        <li>Character pictures and angle pictures are visible only to signed-in invited guests. On the site, only you can see your original photo.</li>
        <li>{CONSENT_ARCHIVE_PRIVACY_EN}</li>
        <li>{ADMIN_CARE_LINE_EN}</li>
        <li>Photos attached to notes are, for now, visible only to the person who posted them and the family. Even if you choose a wider scope, a note with a photo goes up only as far as the family scope. Photos are kept in private storage under random names and shown only on the screens of people allowed to see them, through a short link that works for 10 minutes.</li>
      </ul>

      <h2><T ko="지우는 법" en="How to delete" /></h2>
      <ul className="stack" data-ko="">
        <li>수첩의 「거두기」를 누르면 그 종이가 바로 지워져요. 붙인 사진이 있으면 저장소의 사진 파일도 함께 지워요.</li>
        <li>캐릭터 화면에서 원본 사진과 캐릭터 그림을 각각 언제든 지울 수 있어요. 캐릭터 그림을 지우면 여러 방향 그림과 3D 모형도 함께 지워져요.</li>
        <li>종이를 남길 때 받은 철회 번호가 있으면 로그인하지 않아도 아래에서 거둘 수 있어요.</li>
        <li>대화창에서 내 글 옆의 「지우기」를 누르면 그 글이 바로 지워져요(말풍선으로 남은 글도 같아요). 집주인도 대화를 지울 수 있어요. 명단에서 빠져 대화창을 열 수 없게 된 뒤에는 가족에게 알려 주세요.</li>
        <li>걷기 사진은 내 갤러리에서 한 장씩, 또는 여러 장을 골라 한꺼번에 지울 수 있어요. 지우면 저장소의 사진 파일도 함께 지워져요. 집주인이 지우면 올리다 끊겨 갤러리에 안 보이던 파일까지 지워요. 계정을 지울 때도 사진 파일을 지워요. 이 둘은 서버가 차례로 지워서 파일이 조금 늦게 사라질 수 있어요.</li>
        <li>걸은 길 기록을 지우고 싶으면 가족에게 알려 주세요. 계정을 지우면 대화와 걸은 길 기록도 함께 지워져요.</li>
        <li>컨트롤 룸 녹화 영상은 계정과 따로 녹화한 컴퓨터에 있어요. 내 모습이 담긴 영상을 지워 달라고 하려면 가족에게 알려 주세요.</li>
        <li>계정째 지우고 싶으면 가족에게 알려 주세요.</li>
      </ul>
      <ul className="stack" data-en="" lang="en">
        <li>Press &ldquo;Remove&rdquo; in your notebook and that note is deleted right away. If a photo was attached, the photo file in storage is deleted too.</li>
        <li>On the character page, you can delete the original photo and the character picture separately at any time. Deleting a character picture also deletes its angle pictures and 3D model.</li>
        <li>If you have the removal code you got when you left a note, you can remove it below without signing in.</li>
        <li>Press &ldquo;Delete&rdquo; next to your message in the chat window and it is deleted right away (the same goes for messages left as speech bubbles). The host can delete chat messages too. If you have been taken off the guest list and can no longer open the chat window, please let the family know.</li>
        <li>You can delete walk photos in your gallery one at a time, or choose several and delete them at once. Deleting them also deletes the photo files in storage. When the host deletes them, files that were cut off while uploading and never showed in the gallery are deleted as well. Photo files are also deleted when an account is deleted. In these two cases the server deletes them in turn, so the files may take a little while to disappear.</li>
        <li>If you want your path record deleted, please let the family know. Deleting your account also deletes your chat messages and path record.</li>
        <li>Control room recordings are kept on the computer that recorded them, separate from accounts. To ask for a video showing you to be deleted, please let the family know.</li>
        <li>If you want your whole account deleted, please let the family know.</li>
      </ul>
      <ReceiptForm />

      <h2><T ko="그림 속 집" en="The house in the pictures" /></h2>
      <p>
        <T
          ko="지도와 방 그림은 놀기 좋게 다시 그린 것이고 실제 도면이 아니에요."
          en="The map and room pictures are redrawn to be fun to play in. They are not the real floor plan."
        />
      </p>
    </div>
  );
}
