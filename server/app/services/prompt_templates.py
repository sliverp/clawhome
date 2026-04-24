"""考试 / 学习 / 长任务的 prompt 模板。

通过 openclaw chat 命令下发给 client。client 跑完把结果原样回传，
server 解析里面的 JSON 块更新对应 session。
"""

EXAM_PROMPT = """你正在参加 ClawExam 基础能力评测。请严格按照下面的规则完成考试：

任务：自我评测 4 个能力维度（基础常识 / 信息检索 / 工具调用 / 表达与创作），
每个维度自测 3 道题（题目可以由你自己设计，难度匹配实际能力），
然后给出最终评分。

输出要求：
1. 先用自然语言简短说明每个维度的题目和你的回答（控制在 200 字以内）。
2. 最后**单独一行**输出一段 JSON 块（用 ```json 包起来），格式如下：

```json
{
  "score": 0-100 的整数,
  "details": [
    {"skill": "基础常识", "passed": 通过题数, "total": 总题数},
    {"skill": "信息检索", "passed": 通过题数, "total": 总题数},
    {"skill": "工具调用", "passed": 通过题数, "total": 总题数},
    {"skill": "表达与创作", "passed": 通过题数, "total": 总题数}
  ],
  "summary": "一句话总结这次考试表现"
}
```

请开始答题。
"""


# 不同 skill_key 对应不同的学习材料模板
STUDY_PROMPTS: dict[str, str] = {
    "info_retrieval": """请学习「信息检索进阶」：
1. 列出 3 个搜索引擎高级语法（site:, filetype:, intext: 等）的实际用法
2. 用一段话解释 RAG（检索增强生成）的核心思想

学完后用一段简短的话总结你的收获，并在最后输出 JSON 块：
```json
{"skill_learned": "信息检索进阶", "experience": 10, "summary": "一句话收获"}
```
""",
    "data_analysis": """请学习「数据分析方法」：
1. 给一个 7 天的 Token 用量数据 [4200, 6800, 9100, 7500, 8200, 12340, 0]，
   分析其中的趋势和异常值
2. 用一段话解释什么是「环比」和「同比」

学完后输出：
```json
{"skill_learned": "数据分析方法", "experience": 12, "summary": "一句话收获"}
```
""",
    "writing": """请学习「文案写作」：
1. 用 3 种不同风格（正式 / 活泼 / 简洁）改写这句话："系统升级完成"
2. 解释什么是 AIDA 写作模型

学完后输出：
```json
{"skill_learned": "文案写作进阶", "experience": 10, "summary": "一句话收获"}
```
""",
}


# 默认学习模板（skill_key 没匹配上时用）
STUDY_PROMPT_DEFAULT = """请学习「{skill_name}」：
基于你目前的能力，自学并总结一些这方面的关键知识点。

学完后输出：
```json
{{"skill_learned": "{skill_name}", "experience": 10, "summary": "一句话收获"}}
```
"""


WORK_PROMPT_TEMPLATE = """用户向你下发了一个长任务，请按用户描述完成：

{task_description}

完成后请给出执行总结，并在最后输出 JSON 块：
```json
{{
  "summary": "本次任务的核心结论 / 产出（1-2 句）",
  "details": {{
    "key_findings": ["发现 1", "发现 2"],
    "actions_taken": ["执行的步骤 1", "执行的步骤 2"]
  }}
}}
```
"""


def build_exam_prompt(exam_type: str = "basic") -> str:
    return EXAM_PROMPT


def build_study_prompt(skill_key: str | None, skill_name: str | None) -> str:
    if skill_key and skill_key in STUDY_PROMPTS:
        return STUDY_PROMPTS[skill_key]
    return STUDY_PROMPT_DEFAULT.format(skill_name=skill_name or skill_key or "通用技能")


def build_work_prompt(task_description: str) -> str:
    return WORK_PROMPT_TEMPLATE.format(task_description=task_description)
