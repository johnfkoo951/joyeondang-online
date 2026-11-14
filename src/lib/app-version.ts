import 'server-only';
import pkg from '../../package.json';

/** 지금 배포된 앱 버전(package.json). 방 의견함이 의견을 쓴 때의 버전으로 적는다 */
export const APP_VERSION: string = pkg.version;
