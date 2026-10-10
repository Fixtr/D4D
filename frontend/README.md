# AI 서버 연결

화면에서 실행 모드를 **실제 API**로 선택하면 PTT 녹음을 `http://localhost:8000/api/tactical-process`로 전송합니다. 요청은 `multipart/form-data`이며 파일 필드는 `audio`입니다. 기본 실행 모드는 데모입니다.

주소 변경은 `.env.example`을 `.env.local`로 복사하고 `VITE_TACTICAL_API_ENDPOINT`를 수정한 뒤 개발 서버를 재시작합니다. 배포용 주소 변경은 재빌드가 필요합니다.

스마트폰의 `localhost`는 스마트폰 자신입니다. 노트북 서버를 이용하려면 해당 서버 주소와 마이크 사용 가능한 보안 컨텍스트를 준비해야 합니다. 현재 백엔드는 실제 모델 대신 고정 샘플을 반환합니다.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## 모션 입력

Space는 누를 때마다 녹음 시작/종료를 전환합니다. 화면 녹음 버튼도 클릭으로 전환합니다. Roll→Space, Pitch→F13(확정), Yaw→F14(즉시 재녹음) 규격은 `../hardware/GESTURE_INPUT.md`를 참고하세요. 실제 모션 감지는 HW 담당 구현이 필요합니다.
