"""
로컬 교범 검색(RAG) 엔진
knowledge_base/chunks.jsonl 에서 무전 내용과 관련된 교범·보고 안내 청크를 키워드로 찾는다.
STT는 app.py, 보고서 구조화는 tactical_rules.py / tactical_summarizer.py 가 담당한다.
"""
import json
import os
from typing import Dict, Any, List

from tactical_rules import NEGATED_PATTERN, classify_report_type

DEFAULT_KNOWLEDGE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "knowledge_base", "chunks.jsonl")

# 검색어로 쓰기엔 너무 일반적인 단어 (모든 보고에 걸려 무관한 청크가 선택되는 것을 방지)
SOP_STOPWORDS = {"확인", "보고", "정보", "정리", "요청", "유지", "반영", "표시", "안내", "자료", "구분", "사용자",
                 "없음", "관측", "발화", "원문", "보존", "단위"}
# 보고 종류별로 함께 검색할 표기 (발화에 종류명이 없어도 해당 양식 안내를 찾도록)
REPORT_TYPE_TERMS = {
    "SALUTE": ("SALUTE",),
    "SITREP": ("SITREP", "상황보고"),
    "9-Line MEDEVAC": ("MEDEVAC", "후송보고"),
}

class TacticalEngine:
    def __init__(self, knowledge_path: str = DEFAULT_KNOWLEDGE_PATH):
        self.knowledge_path = knowledge_path
        self.chunks = self._load_chunks()

    def _load_chunks(self):
        chunks = []
        if os.path.exists(self.knowledge_path):
            with open(self.knowledge_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        chunks.append(json.loads(line))
        return chunks

    @staticmethod
    def _search_terms(chunk: Dict[str, Any]) -> List[str]:
        """청크 keywords 의 각 구절과 구성 단어 (두 글자 이상, 일반어 제외)"""
        terms = []
        for keyword in chunk.get("keywords", []):
            for term in [keyword] + keyword.split():
                if len(term) >= 2 and term not in SOP_STOPWORDS and term not in terms:
                    terms.append(term)
        return terms

    def retrieve_sop(self, query: str) -> str:
        """로컬 키워드 기반 교범 RAG 매칭 (knowledge_base/DOMAIN_HANDOFF.md 규칙)

        - review_status 가 unverified 인 청크는 권고 근거로 쓰지 않음
        - demo_only 청크는 "데모 안내:" 로 시작
        - 관련 청크가 없으면 빈 문자열 (무관한 첫 청크로 대체하지 않음)
        """
        # "부상자 없음" 같은 부정 표현은 검색어에서 제외
        text = NEGATED_PATTERN.sub("", query).upper()
        type_terms = {t.upper() for terms in REPORT_TYPE_TERMS.values() for t in terms}
        current_type_terms = {t.upper() for t in REPORT_TYPE_TERMS[classify_report_type(query)]}

        best, best_score = None, 0.0
        for chunk in self.chunks:
            if chunk.get("review_status") == "unverified":
                continue
            terms = [t.upper() for t in self._search_terms(chunk)]
            # 발화 내용과 겹치는 구체적 단어 1점, 보고 종류 일반 안내는 0.5점 (정정·좌표 등 구체 안내 우선)
            score = sum(1.0 for t in terms if t not in type_terms and t in text)
            if any(t in current_type_terms for t in terms):
                score += 0.5
            if score > best_score:
                best, best_score = chunk, score

        if best is None:
            return ""
        if best.get("review_status") == "demo_only":
            return f"데모 안내: {best['content']}"
        return best["content"]

