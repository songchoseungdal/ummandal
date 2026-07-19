/* 서버 주소 설정 — Supabase 프로젝트 "ummandal" (screencl 개인 계정)
   이 키는 공개용(publishable)이라 웹페이지에 노출되어도 안전합니다.
   데이터 보호는 서버 쪽 행 수준 보안(RLS)이 담당합니다. */
var CLOUD_CONFIG = {
  url: 'https://kcsnlbddphphvzyafmxu.supabase.co',
  key: 'sb_publishable_NZPD5RINx_Uo_tZHnXZzRg_v03bR8MH',
  /* 비밀번호 재설정 메일·소셜 로그인이 돌아올 주소 (Supabase Auth Redirect URLs에도 등록 필요) */
  siteUrl: 'https://songchoseungdal.github.io/ummandal/',
  /* 소셜 로그인 버튼 목록 — Supabase 대시보드에서 해당 제공자 설정 필요 (절차: 로그인_설정_안내.md) */
  oauth: ['google', 'kakao']
};
