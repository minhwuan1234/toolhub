export const thinkQuestions = [
  { key: 'why', label: 'Why', question: 'Người dùng cần update tính năng này để làm gì? Suy luận từ code hiện tại và yêu cầu.' },
  { key: 'what', label: 'What', question: 'Cái cần update hoặc thêm mới này là cái gì?' },
  { key: 'who', label: 'Who', question: 'Ai là người sử dụng?' },
  { key: 'where', label: 'Where', question: 'Nó nên nằm ở đâu trên màn hình?' },
  { key: 'when', label: 'When', question: 'Khi nào nên sử dụng?' },
  { key: 'how', label: 'How', question: 'Đề xuất cách triển khai: tái sử dụng gì, sửa hoặc tạo gì, tại file và function nào, thứ tự thực hiện và cách kiểm tra?' },
] as const;
export type ThinkAnswers = Record<typeof thinkQuestions[number]['key'], string>;
export type ThinkOutput = {
  kind: 'think'; status: 'planned'; request: string; source_node_id: string;
  repository: string; commit: string; model: string; created_at: string; answers: ThinkAnswers;
};
