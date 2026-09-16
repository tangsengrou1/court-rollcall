export type Member = { id: string; name: string; role: "管理员" | "教练" | "队员" };
export type Event = { id: string; title: string; type: string; date: string; place: string; closed: boolean; responses: Record<string, string>; attendance: Record<string, string> };
export type Team = { members: Member[]; events: Event[] };

// A separate record keeps the trial history from being attributed to real members.
export const TEAM_ID = 'roster-20260916';
export function initialTeam(): Team {
  const names = [
    '刘厚成', '李飞跃', '江多思·多力肯', '丁逍宇', '宋懿轩', '郭泽宇',
    '孙鹏', '王昊', '方昊', '蒋世良宸', '闫仲骞', '郑家祺', '杨镇溢',
    '潘冠宇', '樊峻一', '李佳禾', '何金鹏', '吴亦铤', '刘泽宇',
    '孟令洲', '贾元德', '张朝洋', '王斯瑶',
  ];
  return { members: names.map((name, index) => ({ id: `member-${String(index + 1).padStart(3, '0')}`, name, role: name === '王斯瑶' ? '教练' : ['李飞跃', '刘厚成'].includes(name) ? '管理员' : '队员' })), events: [] };
}
