export type ClearanceLevel = "L1" | "L2" | "L3" | "L4";

export type RepositorySummary = {
  id: string;
  title: string;
  description: string;
  noteCount: number;
  clearance: ClearanceLevel;
};

export type NoteSummary = {
  id: string;
  title: string;
  author: string;
  updatedAt: string;
  clearance: ClearanceLevel;
  type: "note" | "pdf" | "docx";
};

export const repositories: RepositorySummary[] = [
  {
    id: "hr",
    title: "人力资源知识库",
    description: "员工制度、入转调离、培训与招聘规范",
    noteCount: 28,
    clearance: "L2"
  },
  {
    id: "rnd",
    title: "研发知识库",
    description: "技术方案、设计评审、架构沉淀与复盘",
    noteCount: 64,
    clearance: "L3"
  },
  {
    id: "ops",
    title: "运营知识库",
    description: "市场投放、客服 FAQ、活动复盘与 SOP",
    noteCount: 37,
    clearance: "L2"
  }
];

export const notesByRepository: Record<string, NoteSummary[]> = {
  hr: [
    {
      id: "attendance-policy",
      title: "2026 员工考勤规范",
      author: "张三",
      updatedAt: "2026-04-02",
      clearance: "L2",
      type: "note"
    },
    {
      id: "onboarding-pack",
      title: "新员工入职材料清单",
      author: "李四",
      updatedAt: "2026-03-28",
      clearance: "L1",
      type: "docx"
    }
  ],
  rnd: [
    {
      id: "rag-architecture",
      title: "RAG 架构设计说明",
      author: "王五",
      updatedAt: "2026-03-31",
      clearance: "L3",
      type: "pdf"
    }
  ],
  ops: [
    {
      id: "campaign-sop",
      title: "市场活动执行 SOP",
      author: "赵六",
      updatedAt: "2026-03-20",
      clearance: "L2",
      type: "note"
    }
  ]
};
