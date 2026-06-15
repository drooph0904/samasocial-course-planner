import json
from app.schemas import CoursePlan, COURSE_PLAN_JSON_SCHEMA, empty_plan

SAMPLE = {
    "title": "Intro to Python",
    "subject": "Python programming",
    "audience": {"age_group": "16-18", "skill_level": "beginner", "prior_knowledge": "none"},
    "schedule": {"duration": "6 weeks", "session_frequency": "2x/week", "session_length": "60 min"},
    "learning_goals": ["Write basic programs"],
    "modules": [{
        "title": "Basics",
        "objectives": ["Variables and types"],
        "prerequisites": ["Computer literacy"],
        "assessment": "Quiz on syntax",
        "lessons": [{
            "title": "Variables",
            "topics": ["int", "str"],
            "difficulty": "beginner",
            "resources": [{"title": "Python docs", "url": "https://docs.python.org",
                           "type": "docs", "source": "python.org"}],
        }],
    }],
}

def test_course_plan_roundtrips():
    plan = CoursePlan.model_validate(SAMPLE)
    assert plan.modules[0].lessons[0].difficulty == "beginner"
    assert plan.model_dump() == SAMPLE

def test_json_schema_is_strict():
    # Every object must forbid extra props (Anthropic strict-tool requirement)
    def assert_strict(node):
        if isinstance(node, dict):
            if node.get("type") == "object":
                assert node.get("additionalProperties") is False
                # all properties must be required under strict
                assert set(node.get("required", [])) == set(node.get("properties", {}).keys())
            for v in node.values():
                assert_strict(v)
        elif isinstance(node, list):
            for v in node:
                assert_strict(v)
    assert_strict(COURSE_PLAN_JSON_SCHEMA)

def test_empty_plan_validates():
    CoursePlan.model_validate(empty_plan())
