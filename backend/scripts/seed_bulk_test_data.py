from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.db.session import SessionLocal
from app.models.content import Folder, Note, Repository
from app.services.search import index_note

SEED_ROOT_NAME = "[批量测试] 2026Q2 长文样本"
TITLE_SUFFIX = "（2026Q2样本）"


@dataclass(frozen=True)
class FolderSeed:
    name: str
    min_clearance_level: int
    note_titles: tuple[str, ...]


@dataclass(frozen=True)
class RepositorySeed:
    slug: str
    folder_seeds: tuple[FolderSeed, ...]
    authors: tuple[str, ...]
    role_label: str
    metric_label: str


REPOSITORY_SEEDS: tuple[RepositorySeed, ...] = (
    RepositorySeed(
        slug="hr",
        authors=("林晓雨", "赵明哲", "陈思远", "黄嘉宁"),
        role_label="业务主管、人力BP、用人经理",
        metric_label="招聘周期、到岗率、培训完成率、续签及时率",
        folder_seeds=(
            FolderSeed(
                name="招聘与入职",
                min_clearance_level=1,
                note_titles=(
                    "校招面试标准化流程",
                    "新员工30天融入计划",
                    "用工编制评审机制",
                ),
            ),
            FolderSeed(
                name="培训与绩效",
                min_clearance_level=2,
                note_titles=(
                    "一线主管绩效面谈手册",
                    "岗位能力地图维护办法",
                    "季度培训项目复盘方法",
                ),
            ),
            FolderSeed(
                name="薪酬与制度",
                min_clearance_level=2,
                note_titles=(
                    "调薪评审流程控制点",
                    "奖金发放口径说明",
                    "加班与调休执行细则",
                ),
            ),
            FolderSeed(
                name="员工关系与合规",
                min_clearance_level=2,
                note_titles=(
                    "劳动合同续签管理",
                    "离职交接风险清单",
                    "申诉处理闭环机制",
                ),
            ),
        ),
    ),
    RepositorySeed(
        slug="rnd",
        authors=("周启明", "徐一航", "郭晨曦", "唐子墨"),
        role_label="架构师、技术负责人、平台工程师",
        metric_label="发布成功率、故障恢复时长、构建耗时、接口错误率",
        folder_seeds=(
            FolderSeed(
                name="平台架构",
                min_clearance_level=3,
                note_titles=(
                    "配置中心高可用改造方案",
                    "统一鉴权网关演进路线",
                    "研发知识库索引架构说明",
                ),
            ),
            FolderSeed(
                name="研发流程",
                min_clearance_level=3,
                note_titles=(
                    "需求评审准入清单",
                    "版本分支协作规范",
                    "代码评审分级标准",
                ),
            ),
            FolderSeed(
                name="发布与稳定性",
                min_clearance_level=3,
                note_titles=(
                    "灰度发布回滚预案",
                    "核心接口压测计划",
                    "监控告警收敛策略",
                ),
            ),
            FolderSeed(
                name="预研与安全",
                min_clearance_level=4,
                note_titles=(
                    "大模型接入安全边界",
                    "向量检索成本评估",
                    "密钥轮换演练方案",
                ),
            ),
        ),
    ),
    RepositorySeed(
        slug="ops",
        authors=("沈可心", "罗俊川", "邓雨桐", "马会泽"),
        role_label="城市运营、渠道经理、活动负责人",
        metric_label="转化率、客诉响应时长、预算消耗率、活动回收周期",
        folder_seeds=(
            FolderSeed(
                name="渠道运营",
                min_clearance_level=2,
                note_titles=(
                    "区域渠道拓展月度打法",
                    "城市站点招商跟进机制",
                    "渠道分层运营策略",
                ),
            ),
            FolderSeed(
                name="内容活动",
                min_clearance_level=2,
                note_titles=(
                    "大促活动执行清单",
                    "社群内容日历设计",
                    "活动预算复盘模板",
                ),
            ),
            FolderSeed(
                name="客诉与风险",
                min_clearance_level=3,
                note_titles=(
                    "客诉升级处理手册",
                    "舆情响应分级机制",
                    "异常退款排查流程",
                ),
            ),
            FolderSeed(
                name="数据复盘",
                min_clearance_level=2,
                note_titles=(
                    "周报指标解读模板",
                    "漏斗转化异常排查",
                    "用户留存分析工作说明",
                ),
            ),
        ),
    ),
)


def _stable_int(value: str) -> int:
    return int(hashlib.sha1(value.encode("utf-8")).hexdigest()[:8], 16)


def _build_paragraphs(
    *,
    repository_name: str,
    folder_name: str,
    title: str,
    author_name: str,
    clearance_level: int,
    role_label: str,
    metric_label: str,
    seed_value: int,
) -> list[str]:
    base_days = 7 + seed_value % 9
    review_cycle = 14 + seed_value % 11
    metric_a = 65 + seed_value % 23
    metric_b = 72 + (seed_value // 3) % 19
    metric_c = 80 + (seed_value // 7) % 15
    quota_value = 20 + seed_value % 18
    paragraph_1 = (
        f"本文为 {repository_name} 的批量测试样本，主题为《{title}》。样本内容按真实企业知识笔记风格编排，"
        f"用于验证仓库浏览、全文检索、权限过滤、问答召回与来源引用。本文默认由 {author_name} 维护，"
        f"当前建议密级为 L{clearance_level}，所在专题目录为“{folder_name}”，读者主要是 {role_label}。"
    )
    paragraph_2 = (
        f"背景部分强调，这类主题通常不是一次性通知，而是需要持续沉淀的执行规范。过去多个周期中，相关事项往往因为口径不一致、"
        f"责任边界不清和交接材料不完整而导致重复沟通，所以知识库必须把目标、范围、触发条件和交付标准写清楚。"
        f"在实际应用时，团队应先判断问题是否确属“{folder_name}”场景，再决定是否沿用本条目中的建议动作。"
    )
    paragraph_3 = (
        f"适用范围建议覆盖三个层次：第一层是日常例行处理，例如周会、月度复盘、标准审批与固定报告；第二层是专项执行，"
        f"例如高峰期资源协调、跨部门协同或新制度落地；第三层是异常处置，即遇到时点压力、口径争议、资源缺口、人员变更或系统故障时，"
        f"仍要用同一份知识条目维持判断依据。这样做的目的不是增加流程，而是减少反复解释成本。"
    )
    paragraph_4 = (
        f"执行流程建议拆成四步。第一步，收集原始事实与输入材料，确保数据、附件、负责人和时间窗口完整；第二步，按统一模板进行校验，"
        f"明确哪些结论可直接采用，哪些需要补充说明；第三步，输出本轮执行方案并同步到关联负责人；第四步，在执行完成后的 {review_cycle} 天内完成复盘，"
        f"把新增经验回写知识库。任何一步出现阻塞，都要记录原因、影响范围和替代方案，而不是仅在群聊中口头处理。"
    )
    paragraph_5 = (
        f"指标口径部分建议至少覆盖 {metric_label}。本样本给出的测试口径是：目标线不低于 {metric_a}%，稳定线不低于 {metric_b}%，"
        f"预警线不低于 {metric_c}%。如果某项指标在连续 {base_days} 天内低于预警线，就应触发专项分析；如果当月累计偏差超过 {quota_value}% ，"
        f"则需要由条目负责人发起评审，确认是目标设置不合理、执行动作不足，还是上游输入存在偏差。"
    )
    paragraph_6 = (
        f"协同机制部分要明确谁负责拍板、谁负责产出、谁负责复核。建议由条目作者所在岗位牵头组织事实整理，相关业务负责人提供背景，"
        f"横向协作部门只对自己负责的口径签字确认。这样可以避免出现“所有人都参与但没有人对最终版本负责”的情况。"
        f"在系统内，这也有利于后续按作者、仓库、更新时间和密级做筛选，方便回溯不同版本的结论演进。"
    )
    paragraph_7 = (
        f"风险提示部分至少包含三类。第一类是口径漂移，即不同团队对同一指标、同一动作理解不一致；第二类是资料过期，旧结论被继续引用；"
        f"第三类是流程依赖个人经验，导致关键人员离岗后执行质量明显下降。为降低这些风险，建议把关键判断写成可搜索的短句，把例外处理写成边界条件，"
        f"并在标题、正文和附件摘要中保留足够多的检索信号词。"
    )
    paragraph_8 = (
        f"维护频率建议至少按月检查一次，在组织调整、制度更新、系统切换、重大活动或事故复盘后应立即更新。更新时不要只改结论，"
        f"还要补写决策依据、数据来源、争议点和后续动作。对于《{title}》这类条目，如果连续两个检查周期没有更新，也应在目录中标记为待复核，"
        f"避免读者误把历史版本当作当前有效规则。"
    )
    paragraph_9 = (
        f"作为测试样本，本文特意保留了较完整的场景描述、指标口径、角色分工和风险条款，用来验证系统在长文本情况下的切分质量、"
        f"搜索命中效果以及问答来源筛选稳定性。只要后续看到相同标题后缀 {TITLE_SUFFIX}，就可以确定该笔记属于本轮批量造数结果，"
        f"既方便集中测试，也方便后续统一清理。"
    )
    return [
        paragraph_1,
        paragraph_2,
        paragraph_3,
        paragraph_4,
        paragraph_5,
        paragraph_6,
        paragraph_7,
        paragraph_8,
        paragraph_9,
    ]


def _build_content_json(paragraphs: list[str]) -> str:
    return json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": paragraph}],
                }
                for paragraph in paragraphs
            ],
        },
        ensure_ascii=False,
    )


def _get_or_create_folder(
    *,
    db,
    repository: Repository,
    name: str,
    min_clearance_level: int,
    parent_id: int | None,
) -> tuple[Folder, bool]:
    folder = (
        db.query(Folder)
        .filter(
            Folder.repository_id == repository.id,
            Folder.parent_id == parent_id,
            Folder.name == name,
        )
        .first()
    )
    if folder is None:
        folder = Folder(
            repository_id=repository.id,
            parent_id=parent_id,
            name=name,
            min_clearance_level=max(min_clearance_level, repository.min_clearance_level),
        )
        db.add(folder)
        db.commit()
        db.refresh(folder)
        return folder, True

    expected_level = max(min_clearance_level, repository.min_clearance_level)
    if folder.min_clearance_level != expected_level:
        folder.min_clearance_level = expected_level
        db.add(folder)
        db.commit()
        db.refresh(folder)
    return folder, False


def _upsert_note(
    *,
    db,
    repository: Repository,
    folder: Folder,
    title: str,
    author_name: str,
    content_text: str,
    content_json: str,
    min_clearance_level: int,
    created_at: datetime,
    updated_at: datetime,
) -> str:
    note = (
        db.query(Note)
        .filter(
            Note.repository_id == repository.id,
            Note.folder_id == folder.id,
            Note.title == title,
        )
        .first()
    )

    action = "updated"
    if note is None:
        action = "created"
        note = Note(
            repository_id=repository.id,
            folder_id=folder.id,
            title=title,
            author_name=author_name,
            content_text=content_text,
            content_json=content_json,
            min_clearance_level=min_clearance_level,
            created_at=created_at,
            updated_at=updated_at,
        )
        db.add(note)
        db.commit()
        db.refresh(note)
    else:
        note.author_name = author_name
        note.content_text = content_text
        note.content_json = content_json
        note.min_clearance_level = min_clearance_level
        note.created_at = created_at
        note.updated_at = updated_at
        db.add(note)
        db.commit()
        db.refresh(note)

    index_note(db, note.id)
    return action


def main() -> None:
    db = SessionLocal()
    created_folders = 0
    created_notes = 0
    updated_notes = 0
    seeded_titles: list[str] = []
    started_at = datetime.now()

    try:
        for repo_index, repo_seed in enumerate(REPOSITORY_SEEDS):
            repository = db.query(Repository).filter(Repository.slug == repo_seed.slug).first()
            if repository is None:
                print(f"[skip] repository slug={repo_seed.slug} not found")
                continue

            root_folder, root_created = _get_or_create_folder(
                db=db,
                repository=repository,
                name=SEED_ROOT_NAME,
                min_clearance_level=repository.min_clearance_level,
                parent_id=None,
            )
            if root_created:
                created_folders += 1

            for folder_index, folder_seed in enumerate(repo_seed.folder_seeds):
                topic_folder, topic_created = _get_or_create_folder(
                    db=db,
                    repository=repository,
                    name=folder_seed.name,
                    min_clearance_level=folder_seed.min_clearance_level,
                    parent_id=root_folder.id,
                )
                if topic_created:
                    created_folders += 1

                for note_index, base_title in enumerate(folder_seed.note_titles):
                    titled_seed = f"{repository.slug}:{folder_seed.name}:{base_title}"
                    stable_number = _stable_int(titled_seed)
                    title = f"{base_title}{TITLE_SUFFIX}"
                    author_name = repo_seed.authors[(folder_index + note_index) % len(repo_seed.authors)]
                    paragraphs = _build_paragraphs(
                        repository_name=repository.name,
                        folder_name=folder_seed.name,
                        title=base_title,
                        author_name=author_name,
                        clearance_level=min(
                            4,
                            max(repository.min_clearance_level, folder_seed.min_clearance_level + (stable_number % 2)),
                        ),
                        role_label=repo_seed.role_label,
                        metric_label=repo_seed.metric_label,
                        seed_value=stable_number,
                    )
                    content_text = "\n\n".join(paragraphs)
                    content_json = _build_content_json(paragraphs)
                    note_clearance = min(
                        4,
                        max(repository.min_clearance_level, folder_seed.min_clearance_level + (stable_number % 2)),
                    )
                    created_at = started_at - timedelta(days=(repo_index * 25 + folder_index * 8 + note_index * 3 + stable_number % 5))
                    updated_at = created_at + timedelta(days=1 + stable_number % 6)
                    action = _upsert_note(
                        db=db,
                        repository=repository,
                        folder=topic_folder,
                        title=title,
                        author_name=author_name,
                        content_text=content_text,
                        content_json=content_json,
                        min_clearance_level=note_clearance,
                        created_at=created_at,
                        updated_at=updated_at,
                    )
                    if action == "created":
                        created_notes += 1
                    else:
                        updated_notes += 1
                    seeded_titles.append(title)
                    print(f"[{action}] repo={repository.slug} folder={folder_seed.name} title={title}")

        total_seeded = len(seeded_titles)
        print("---- summary ----")
        print(f"folders_touched={created_folders}")
        print(f"notes_created={created_notes}")
        print(f"notes_updated={updated_notes}")
        print(f"notes_total_processed={total_seeded}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
