import { AppShell } from "../components/app-shell";
import { requireCurrentUser } from "../lib/auth";

const newsItems = [
  { tag: "最新", title: "企业知识库首页框架已接入", date: "2026-04-27" },
  { tag: "公告", title: "知识仓库、全文检索、知识问答入口已纳入统一导航", date: "2026-04-27" },
  { tag: "活动", title: "首页内容后续将按真实业务数据继续细化", date: "2026-04-27" },
  { tag: "最新", title: "当前页面先保留草稿结构，等待下一轮内容调整", date: "2026-04-27" }
];

export default async function HomePage() {
  const currentUser = await requireCurrentUser();

  return (
    <AppShell
      currentUser={currentUser}
      title="首页"
      description="KMS 用户侧首页，先搭建整体框架，后续再细化内容。"
    >
      <div className="kms-home-view">
        <section className="kms-home-hero">
          <div className="kms-carousel-header">
            <span className="kms-slide-current">01</span>
            <span className="kms-slide-total"> /03//</span>
          </div>

          <div className="kms-home-visual">
            <div className="kms-home-visual-grid" />
            <div className="kms-home-visual-core">
              <span>KMS</span>
              <strong>Knowledge Management System</strong>
            </div>
          </div>

          <div className="kms-carousel-footer">
            <div className="kms-footer-line" />
            <div className="kms-carousel-indicators">
              <span className="active" />
              <span />
              <span />
            </div>
          </div>
        </section>

        <div className="kms-vertical-divider">
          <div />
        </div>

        <section className="kms-home-news">
          <header className="kms-news-tabs">
            <div className="active">
              <span className="kms-tab-indicator">➔ 01</span>
              <span>最新</span>
            </div>
            <div>公告</div>
            <div>知识</div>
            <div>动态</div>
          </header>

          <ul className="kms-news-list">
            {newsItems.map((item) => (
              <li key={`${item.tag}-${item.title}`}>
                <div>
                  <span className="kms-news-tag">【{item.tag}】</span>
                  <span>{item.title}</span>
                </div>
                <time>{item.date}</time>
              </li>
            ))}
          </ul>

          <div className="kms-more-container">
            <a className="kms-more-btn" href="/repositories">
              MORE <b>+</b>
            </a>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
