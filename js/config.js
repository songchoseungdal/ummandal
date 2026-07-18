/* 서버 주소 설정 — Supabase 프로젝트 "ummandal" (screencl 개인 계정)
   이 키는 공개용(publishable)이라 웹페이지에 노출되어도 안전합니다.
   데이터 보호는 서버 쪽 행 수준 보안(RLS)이 담당합니다. */
var CLOUD_CONFIG = {
  url: 'https://kcsnlbddphphvzyafmxu.supabase.co',
  key: 'sb_publishable_NZPD5RINx_Uo_tZHnXZzRg_v03bR8MH',
  /* 비밀번호 재설정 메일이 돌아올 주소 (Supabase Auth Redirect URLs에도 등록 필요) */
  siteUrl: 'https://songchoseungdal.github.io/ummandal/',
  /* 전화(문자 인증) 가입 — SMS 제공자 연결 + 보호장치(캡차·지역제한·지출한도) 완료 전까지 false.
     켜는 절차·필수 체크리스트: 프로젝트 루트 전화인증_설정_안내.md */
  phoneAuth: false
};
