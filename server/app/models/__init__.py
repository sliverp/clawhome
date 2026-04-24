from app.core.database import Base  # noqa: F401 - ensure Base is imported before models

from app.models.user import User  # noqa: F401
from app.models.agent import Agent  # noqa: F401
from app.models.metric import MetricDefinition, Metric  # noqa: F401
from app.models.profile import AgentProfile  # noqa: F401
from app.models.skill import AgentSkill  # noqa: F401
from app.models.diary import AgentDiary  # noqa: F401
from app.models.certificate import AgentCertificate  # noqa: F401
from app.models.session import ExamSession, StudySession, WorkSession  # noqa: F401
from app.models.alert import Alert  # noqa: F401
