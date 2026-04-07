from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.content import Attachment, Folder, Note, Repository
from app.models.user import Department, Role, User, UserRole


def seed_database(db: Session) -> None:
    role_seed = [
        ("admin", "管理员"),
        ("employee", "员工"),
    ]

    for code, name in role_seed:
        role = db.query(Role).filter(Role.code == code).first()
        if role is None:
            role = Role(code=code, name=name, is_system=True)
        else:
            role.name = name
            role.is_system = True
        db.add(role)
    db.commit()

    department_seed = [
        ("unassigned", "未分配"),
        ("hr", "人力资源部"),
        ("rnd", "研发部"),
        ("ops", "运营部"),
    ]
    for code, name in department_seed:
        department = db.query(Department).filter(Department.code == code).first()
        if department is None:
            db.add(Department(code=code, name=name, is_active=True))
    db.commit()

    admin_user = db.query(User).filter(User.username == "admin").first()
    if admin_user is None:
        admin_user = User(
            username="admin",
            full_name="系统管理员",
            email="admin@example.com",
            hashed_password=get_password_hash("123456"),
            clearance_level=4,
            need_password_change=False,
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)

    normal_user = db.query(User).filter(User.username == "user").first()
    if normal_user is None:
        normal_user = User(
            username="user",
            full_name="普通员工",
            email="user@example.com",
            hashed_password=get_password_hash("123456"),
            clearance_level=2,
            need_password_change=False,
        )
        db.add(normal_user)
        db.commit()
        db.refresh(normal_user)

    _ensure_user_role(db, admin_user.id, "admin")
    _ensure_user_role(db, normal_user.id, "employee")

    if db.query(Repository).count() == 0:
        hr_repo = Repository(
            slug="hr",
            name="人力资源知识库",
            description="员工制度、入转调离、培训与招聘规范。",
            min_clearance_level=2,
        )
        rnd_repo = Repository(
            slug="rnd",
            name="研发知识库",
            description="技术方案、设计评审、架构沉淀与复盘。",
            min_clearance_level=3,
        )
        ops_repo = Repository(
            slug="ops",
            name="运营知识库",
            description="市场投放、客服 FAQ、活动复盘与 SOP。",
            min_clearance_level=2,
        )
        db.add_all([hr_repo, rnd_repo, ops_repo])
        db.commit()
        db.refresh(hr_repo)
        db.refresh(rnd_repo)
        db.refresh(ops_repo)

        hr_folder = Folder(repository_id=hr_repo.id, name="制度规范", min_clearance_level=2)
        rnd_folder = Folder(repository_id=rnd_repo.id, name="架构设计", min_clearance_level=3)
        ops_folder = Folder(repository_id=ops_repo.id, name="运营执行", min_clearance_level=2)
        db.add_all([hr_folder, rnd_folder, ops_folder])
        db.commit()
        db.refresh(hr_folder)
        db.refresh(rnd_folder)
        db.refresh(ops_folder)

        hr_note = Note(
            repository_id=hr_repo.id,
            folder_id=hr_folder.id,
            title="2026 员工考勤规范",
            content_json='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"工作日为周一至周五，标准出勤时间为 09:30 至 18:30。"}]}]}',
            content_text="工作日为周一至周五，标准出勤时间为 09:30 至 18:30。",
            min_clearance_level=2,
        )
        rnd_note = Note(
            repository_id=rnd_repo.id,
            folder_id=rnd_folder.id,
            title="RAG 架构设计说明",
            content_json='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"研发知识库采用 MySQL 保存元数据，Elasticsearch 提供检索。"}]}]}',
            content_text="研发知识库采用 MySQL 保存元数据，Elasticsearch 提供检索。",
            min_clearance_level=3,
        )
        ops_note = Note(
            repository_id=ops_repo.id,
            folder_id=ops_folder.id,
            title="市场活动执行 SOP",
            content_json='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"活动执行需经过目标确认、预算审批、物料检查和结果复盘。"}]}]}',
            content_text="活动执行需经过目标确认、预算审批、物料检查和结果复盘。",
            min_clearance_level=2,
        )
        db.add_all([hr_note, rnd_note, ops_note])
        db.commit()
        db.refresh(hr_note)
        db.refresh(rnd_note)
        db.refresh(ops_note)

        db.add_all(
            [
                Attachment(
                    note_id=hr_note.id,
                    file_name="考勤说明.pdf",
                    file_type="pdf",
                    object_key="seed/hr-attendance.pdf",
                    file_size=1024,
                ),
                Attachment(
                    note_id=ops_note.id,
                    file_name="活动模板.docx",
                    file_type="docx",
                    object_key="seed/ops-template.docx",
                    file_size=2048,
                ),
            ]
        )
        db.commit()


def _ensure_user_role(db: Session, user_id: int, role_code: str) -> None:
    role = db.query(Role).filter(Role.code == role_code).first()
    if role is None:
        return

    exists = db.query(UserRole).filter(UserRole.user_id == user_id, UserRole.role_id == role.id).first()
    if exists is None:
        db.add(UserRole(user_id=user_id, role_id=role.id))
        db.commit()
