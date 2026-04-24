"""龙虾默认技能树定义（7 维度 × 多个 skill）

新建 Agent 时会以此为模板批量插入 agent_skills；
alembic 004 迁移在为存量 agent 补 profile 时也复用这份数据。
"""

# 7 个维度的技能树定义
DEFAULT_SKILL_TREE: list[dict] = [
    {
        "dimension": "basic",
        "icon": "📚",
        "name": "基础常识",
        "skills": [
            {"key": "daily_qa", "name": "日常问答", "level": 1, "unlocked": True, "secondary": []},
            {"key": "common_sense", "name": "常识判断", "level": 1, "unlocked": True, "secondary": []},
            {"key": "encyclopedia", "name": "百科知识", "level": 0, "unlocked": False, "secondary": []},
        ],
    },
    {
        "dimension": "retrieval",
        "icon": "🔍",
        "name": "信息检索",
        "skills": [
            {"key": "info_retrieval", "name": "信息检索", "level": 1, "unlocked": True, "secondary": []},
            {"key": "data_analysis", "name": "数据分析", "level": 0, "unlocked": False, "secondary": ["reasoning"]},
            {"key": "competitor_analysis", "name": "竞品分析", "level": 0, "unlocked": False, "secondary": ["reasoning"]},
            {"key": "trend_forecast", "name": "趋势预测", "level": 0, "unlocked": False, "secondary": ["reasoning"]},
        ],
    },
    {
        "dimension": "reasoning",
        "icon": "🧠",
        "name": "复杂推理",
        "skills": [
            {"key": "logic_reasoning", "name": "逻辑推理", "level": 1, "unlocked": True, "secondary": []},
            {"key": "deep_reasoning", "name": "深度推理", "level": 0, "unlocked": False, "secondary": []},
            {"key": "multi_step", "name": "多步推演", "level": 0, "unlocked": False, "secondary": []},
        ],
    },
    {
        "dimension": "tools",
        "icon": "🔧",
        "name": "工具调用",
        "skills": [
            {"key": "report_gen", "name": "报告生成", "level": 0, "unlocked": False, "secondary": ["expression"]},
            {"key": "file_handle", "name": "文件处理", "level": 1, "unlocked": True, "secondary": []},
            {"key": "api_call", "name": "API 调用", "level": 0, "unlocked": False, "secondary": []},
        ],
    },
    {
        "dimension": "system",
        "icon": "🖥️",
        "name": "系统驾驭",
        "skills": [
            {"key": "env_config", "name": "环境配置", "level": 0, "unlocked": False, "secondary": []},
            {"key": "perm_mgmt", "name": "权限管理", "level": 0, "unlocked": False, "secondary": []},
            {"key": "multi_model", "name": "多模型协调", "level": 0, "unlocked": False, "secondary": []},
        ],
    },
    {
        "dimension": "automation",
        "icon": "⚡",
        "name": "执行与自动化",
        "skills": [
            {"key": "task_split", "name": "任务拆解", "level": 1, "unlocked": True, "secondary": ["reasoning"]},
            {"key": "auto_schedule", "name": "自动调度", "level": 0, "unlocked": False, "secondary": []},
            {"key": "batch_process", "name": "批量处理", "level": 0, "unlocked": False, "secondary": []},
        ],
    },
    {
        "dimension": "expression",
        "icon": "🎨",
        "name": "表达与创作",
        "skills": [
            {"key": "writing", "name": "文案写作", "level": 0, "unlocked": False, "secondary": []},
            {"key": "visual_layout", "name": "视觉排版", "level": 0, "unlocked": False, "secondary": []},
            {"key": "creative_plan", "name": "创意策划", "level": 0, "unlocked": False, "secondary": []},
            {"key": "style_mimic", "name": "风格模仿", "level": 0, "unlocked": False, "secondary": []},
        ],
    },
]


def iter_skill_rows(agent_id: int) -> list[dict]:
    """展开所有 skill 行，用于批量 insert"""
    rows = []
    for dim in DEFAULT_SKILL_TREE:
        for skill in dim["skills"]:
            rows.append({
                "agent_id": agent_id,
                "dimension": dim["dimension"],
                "skill_key": skill["key"],
                "skill_name": skill["name"],
                "level": skill["level"],
                "unlocked": skill["unlocked"],
                "secondary_skills": skill["secondary"] or None,
            })
    return rows


# 维度元数据（图标、显示名），前端渲染用
DIMENSION_META: dict[str, dict] = {
    dim["dimension"]: {"icon": dim["icon"], "name": dim["name"]}
    for dim in DEFAULT_SKILL_TREE
}
