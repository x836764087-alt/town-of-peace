/**
 * Prompt template management for LLM interactions.
 *
 * Every prompt template has a corresponding fallback that returns
 * sensible defaults when the LLM is unavailable.
 */

// ─── Newborn persona ───────────────────────────────────────────────

/**
 * Generate the prompt used to create a newborn agent's initial persona.
 */
export function personaNewbornPrompt(
  surname: string,
  gender: string,
  birthYear: number,
  fatherName?: string,
  motherName?: string,
): string {
  const familyInfo = [];
  if (fatherName) familyInfo.push(`- 父亲：${fatherName}`);
  if (motherName) familyInfo.push(`- 母亲：${motherName}`);

  return `你是桃源镇的一位新生儿。请生成你的人格特征。

基本信息：
- 姓氏：${surname}
- 性别：${gender}
- 出生年份：桃源镇 ${birthYear} 年${familyInfo.length > 0 ? '\n' + familyInfo.join('\n') : ''}

请以 JSON 格式回复：
{
  "traits": ["3-5个性格特征，每个2-4字"],
  "values": ["2-3个价值观"],
  "motto": "一句符合你性格的话"
}
只输出 JSON，不要任何其他文字。`;
}

/**
 * Fallback persona for when the LLM is unavailable.
 */
export function fallbackNewbornPersona(): { traits: string[]; values: string[]; motto: string } {
  return {
    traits: ['平凡', '温和'],
    values: ['随遇而安'],
    motto: '日子总要过下去。',
  };
}

// ─── Obituary ──────────────────────────────────────────────────────

/**
 * Generate the prompt used to compose an agent's obituary at death.
 */
export function obituaryPrompt(
  name: string,
  birthYear: number,
  deathYear: number,
  age: number,
  timeline: { year: number; description: string }[],
): string {
  const timelineLines = timeline
    .map((event) => `- 桃源镇${event.year}年：${event.description}`)
    .join('\n');

  return `你是桃源镇的记录者。请为逝者撰写讣告。

逝者信息：
- 姓名：${name}
- 出生年份：桃源镇 ${birthYear} 年
- 死亡年份：桃源镇 ${deathYear} 年
- 享年：${age} 岁

人生大事：
${timelineLines || '暂无重大事件记录。'}

请以 JSON 格式回复：
{
  "summary": "一段盖棺定论的总结（30-80字）",
  "legacy": "最被人记住的一件事（10-30字）"
}
只输出 JSON，不要任何其他文字。`;
}

/**
 * Fallback obituary for when the LLM is unavailable.
 */
export function fallbackObituary(name: string): { summary: string; legacy: string } {
  return {
    summary: `${name} 在桃源镇度过了平凡的一生。`,
    legacy: '他是桃源镇众多居民之一。',
  };
}

// ─── Biography update ──────────────────────────────────────────────

/**
 * Generate the prompt used to periodically update an agent's
 * narrative_arc during their lifetime.
 */
export function biographyUpdatePrompt(
  name: string,
  age: number,
  recentEvents: string[],
): string {
  const eventsList = recentEvents
    .map((evt) => `- ${evt}`)
    .join('\n');

  return `你是桃源镇的人物传记作者。请为角色更新人物弧光描述。

角色信息：
- 姓名：${name}
- 年龄：${age} 岁

近期经历：
${eventsList || '无明显事件发生。'}

请输出一段 30-60 字的人物弧光总结，反映角色近期的人生变化、性格发展或命运转折。只输出纯文本，不要 JSON。`;
}

/**
 * Fallback biography update for when the LLM is unavailable.
 */
export function fallbackBiographyUpdate(name: string): string {
  return `${name} 在桃源镇过着平凡的生活。`;
}
