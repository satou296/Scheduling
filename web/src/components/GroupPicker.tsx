"use client";

import { useState } from "react";

/** 調整を作るグループを選ぶ。既存のグループか、新しいグループ（名前を入力）か */
export function GroupPicker({ groups, defaultGroupId }: { groups: { id: string; name: string }[]; defaultGroupId?: string }) {
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id ?? "");
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label">グループ</span>
        <select name="groupId" className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          <option value="">＋ 新しいグループを作る</option>
        </select>
      </label>
      {groupId === "" && (
        <label className="block">
          <span className="label">新しいグループ名</span>
          <input name="groupName" className="input" placeholder="例：大学の友達" required />
        </label>
      )}
      <p className="text-xs text-muted">
        {groupId === ""
          ? "作成後にグループの招待リンクが発行されます。"
          : "グループのメンバー全員が参加者になります。あとからグループに参加した人も判定されます。"}
      </p>
    </div>
  );
}
