"""
knowledge_base/evaluation_cases.jsonl 정답 예시로 보고서 파이프라인 검수
(STT 제외: input_transcript → 규칙 추출 + SOP 검색 → expected 와 비교)

사용: python evaluate.py [-v]
- report_type, data 각 키를 공백만 정규화해 정확히 비교 (의미가 같은 다른 표현도 불일치로 표시하므로 사람이 확인)
- recommended_action 은 정답이 "자료를 전달하지 않은 조건"이라 참고로만 출력 (DOMAIN_HANDOFF.md)
- threat_level 은 합의된 정답이 없어 비교하지 않음
"""
import json
import os
import re
import sys

import tactical_rules as rules
from tactical_engine import TacticalEngine

CASES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "knowledge_base", "evaluation_cases.jsonl")


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", str(value)).strip()


def main(verbose: bool = False) -> int:
    engine = TacticalEngine()
    with open(CASES_PATH, encoding="utf-8") as f:
        cases = [json.loads(line) for line in f if line.strip()]

    type_ok = field_ok = field_total = 0
    for case in cases:
        transcript = case["input_transcript"]
        expected = case["expected"]
        report_type = rules.classify_report_type(transcript)
        data = rules.extract_fields(report_type, transcript)
        sop = engine.retrieve_sop(transcript)

        type_match = report_type == expected["report_type"]
        type_ok += type_match
        mismatches = []
        if type_match:
            for key, want in expected["data"].items():
                field_total += 1
                got = data.get(key, rules.UNKNOWN)
                if _norm(got) == _norm(want):
                    field_ok += 1
                else:
                    mismatches.append((key, want, got))
        else:
            field_total += len(expected["data"])

        status = "PASS" if type_match and not mismatches else "FAIL"
        print(f"[{status}] {case['id']} {transcript}")
        if not type_match:
            print(f"    report_type: 기대 {expected['report_type']} / 결과 {report_type}")
        for key, want, got in mismatches:
            print(f"    {key}: 기대 {want!r} / 결과 {got!r}")
        if verbose or sop:
            print(f"    recommended_action: {sop!r}")
        print(f"    확인 포인트: {case['check']}")

    print()
    print(f"보고 종류 일치: {type_ok}/{len(cases)}")
    print(f"data 필드 일치: {field_ok}/{field_total}")
    return 0 if type_ok == len(cases) and field_ok == field_total else 1


if __name__ == "__main__":
    sys.exit(main(verbose="-v" in sys.argv))
