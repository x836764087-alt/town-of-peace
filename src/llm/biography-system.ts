/**
 * BiographySystem — manages resident biographies: persona, timeline, obituary.
 *
 * Uses the LLM client to generate personas, obituaries, and narrative arcs
 * for agents in the Town of Peace simulation. Falls back to sensible defaults
 * when the LLM is unavailable.
 */

import type { WorldState, AgentState, AgentBiography, LifeEvent, Obituary } from '../core/types.js';
import { llmClient } from './llm-client.js';
import {
  personaNewbornPrompt,
  obituaryPrompt,
  biographyUpdatePrompt,
  fallbackNewbornPersona,
  fallbackObituary,
  fallbackBiographyUpdate,
} from './prompts.js';

/** Keyword→event-type mapping used by parseEvent. */
interface EventMapping {
  keywords: string[];
  type: string;
  importance: number;
}

const EVENT_MAPPINGS: EventMapping[] = [
  { keywords: ['结婚', '娶', '嫁'], type: 'marriage', importance: 0.6 },
  { keywords: ['生子', '生女', '怀孕'], type: 'child_birth', importance: 0.8 },
  { keywords: ['死亡', '饿死'], type: 'death', importance: 1.0 },
  { keywords: ['当选', '升任'], type: 'title_change', importance: 0.5 },
  { keywords: ['偷盗', '偷窃'], type: 'crime', importance: 0.4 },
  { keywords: ['争吵', '斗殴'], type: 'conflict', importance: 0.3 },
  { keywords: ['发明', '发现'], type: 'innovation', importance: 1.0 },
  { keywords: ['迁入'], type: 'immigration', importance: 0.5 },
  { keywords: ['创作', '画作', '诗作', '乐曲'], type: 'achievement', importance: 0.5 },
];

/** Maximum number of LifeEvents kept in the timeline. */
const MAX_TIMELINE_LENGTH = 50;

export class BiographySystem {
  constructor(private state: WorldState) {}

  // ── Init ───────────────────────────────────────────────────────────

  /**
   * Generate an initial biography for a newborn agent.
   * Looks up parents from state.agents, calls the LLM, and stores
   * the resulting persona + a birth LifeEvent in `agent.biography`.
   */
  async initNewbornBiography(agent: AgentState): Promise<void> {
    const father = agent.family.parents.length > 0
      ? this.state.agents.find(a => a.id === agent.family.parents[0])
      : undefined;
    const mother = agent.family.parents.length > 1
      ? this.state.agents.find(a => a.id === agent.family.parents[1])
      : undefined;

    const prompt = personaNewbornPrompt(
      agent.name,
      agent.gender,
      agent.born,
      father?.name,
      mother?.name,
    );

    let response: Awaited<ReturnType<typeof llmClient.chat>>;
    try {
      response = await llmClient.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.8, maxTokens: 500 },
      );
    } catch {
      // LLM call failed → fallback
      response = { content: '', tokensUsed: 0, durationMs: 0, success: false };
    }

    let persona: AgentBiography['persona'];
    if (response.success && response.content.trim()) {
      try {
        const parsed = JSON.parse(response.content);
        persona = {
          traits: Array.isArray(parsed.traits) ? parsed.traits : fallbackNewbornPersona().traits,
          values: Array.isArray(parsed.values) ? parsed.values : fallbackNewbornPersona().values,
          motto: typeof parsed.motto === 'string' ? parsed.motto : fallbackNewbornPersona().motto,
          narrative_arc: `作为桃源镇 ${agent.name}，在新世界开启了人生旅程。`,
          lastUpdated: this.state.year,
        };
      } catch {
        // JSON parse failed → fallback
        persona = {
          ...fallbackNewbornPersona(),
          narrative_arc: `作为桃源镇 ${agent.name}，在新世界开启了人生旅程。`,
          lastUpdated: this.state.year,
        };
      }
    } else {
      // LLM unavailable → fallback
      persona = {
        ...fallbackNewbornPersona(),
        narrative_arc: `作为桃源镇 ${agent.name}，在新世界开启了人生旅程。`,
        lastUpdated: this.state.year,
      };
    }

    agent.biography = {
      persona,
      timeline: [
        {
          year: agent.born,
          type: 'birth',
          description: `${agent.name} 出生在桃源镇，${agent.gender === '男' ? '是个男孩' : '是个女孩'}。`,
          importance: 1.0,
        },
      ],
      reputation: 0,
      lastBiographyUpdate: this.state.year,
    };
  }

  // ── Process ────────────────────────────────────────────────────────

  /**
   * Detect and append LifeEvents from raw event strings.
   * Only runs for living agents with an existing biography.
   */
  processLifeEvents(agent: AgentState, events: string[]): void {
    if (!agent.alive || !agent.biography) return;

    for (const eventText of events) {
      const parsed = this.parseEvent(eventText, agent);
      if (!parsed) continue;

      agent.biography.timeline.push(parsed);

      // Trim timeline to MAX_TIMELINE_LENGTH entries
      if (agent.biography.timeline.length > MAX_TIMELINE_LENGTH) {
        agent.biography.timeline.splice(0, agent.biography.timeline.length - MAX_TIMELINE_LENGTH);
      }
    }
  }

  /**
   * Parse a raw event string into a LifeEvent using keyword matching.
   */
  private parseEvent(eventText: string, agent: AgentState): LifeEvent | undefined {
    for (const mapping of EVENT_MAPPINGS) {
      for (const keyword of mapping.keywords) {
        if (eventText.includes(keyword)) {
          return {
            year: this.state.year,
            type: mapping.type,
            description: eventText,
            importance: mapping.importance,
          };
        }
      }
    }
    return undefined;
  }

  // ── Obits ──────────────────────────────────────────────────────────

  /**
   * Generate an obituary when an agent dies.
   * Excludes death-type events from the timeline sent to the LLM.
   */
  async generateObituary(agent: AgentState): Promise<void> {
    if (!agent.biography || agent.alive) return;

    const timelineForPrompt = agent.biography.timeline
      .filter(e => e.type !== 'death')
      .map(e => ({ year: e.year, description: e.description }));

    const prompt = obituaryPrompt(
      agent.name,
      agent.born,
      agent.deathYear ?? this.state.year,
      agent.age,
      timelineForPrompt,
    );

    let response: Awaited<ReturnType<typeof llmClient.chat>>;
    try {
      response = await llmClient.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.7, maxTokens: 600 },
      );
    } catch {
      response = { content: '', tokensUsed: 0, durationMs: 0, success: false };
    }

    let obituary: Obituary | undefined;
    if (response.success && response.content.trim()) {
      try {
        const parsed = JSON.parse(response.content);
        const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
        const legacy = typeof parsed.legacy === 'string' ? parsed.legacy : '';
        if (summary && legacy) {
          obituary = {
            year: agent.deathYear ?? this.state.year,
            age: agent.age,
            summary,
            legacy,
            majorEventCount: agent.biography.timeline.filter(
              e => e.importance >= 0.5,
            ).length,
          };
        }
      } catch {
        // ignore
      }
    }

    if (!obituary) {
      const fallback = fallbackObituary(agent.name);
      obituary = {
        year: agent.deathYear ?? this.state.year,
        age: agent.age,
        summary: fallback.summary,
        legacy: fallback.legacy,
        majorEventCount: agent.biography.timeline.filter(
          e => e.importance >= 0.5,
        ).length,
      };
    }

    agent.biography.obituary = obituary;
  }

  // ── Narrative update ───────────────────────────────────────────────

  /**
   * Periodically update the agent's narrative_arc.
   * Only runs once every 10 years for living agents with a biography.
   */
  async updateBiographyNarrative(agent: AgentState): Promise<void> {
    if (!agent.biography || !agent.alive) return;

    // Only update once per decade
    if (agent.biography.persona.lastUpdated + 10 <= this.state.year) {
      // Get the last 5 timeline events
      const recentEvents = agent.biography.timeline
        .slice(-5)
        .map(e => `桃源镇${e.year}年：${e.description}`);

      const prompt = biographyUpdatePrompt(agent.name, agent.age, recentEvents);

      let response: Awaited<ReturnType<typeof llmClient.chat>>;
      try {
        response = await llmClient.chat(
          [{ role: 'user', content: prompt }],
          { temperature: 0.7, maxTokens: 300 },
        );
      } catch {
        response = { content: '', tokensUsed: 0, durationMs: 0, success: false };
      }

      if (response.success && response.content.trim()) {
        agent.biography.persona.narrative_arc = response.content.trim();
      } else {
        agent.biography.persona.narrative_arc = fallbackBiographyUpdate(agent.name);
      }

      agent.biography.persona.lastUpdated = this.state.year;
      agent.biography.lastBiographyUpdate = this.state.year;
    }
  }

  // ── Query ──────────────────────────────────────────────────────────

  /**
   * Get a formatted biography summary for display.
   */
  getBiographySummary(agentId: string): string {
    const agent = this.state.agents.find(a => a.id === agentId);
    if (!agent) {
      return `未找到 ID 为 ${agentId} 的居民。`;
    }

    if (!agent.biography) {
      return `${agent.name}（${agent.gender}，${agent.age}岁）\n暂无档案信息。`;
    }

    const b = agent.biography;
    const lines: string[] = [
      `${agent.name}（${agent.gender}，${agent.age}岁）`,
      `性格：${b.persona.traits.join('、')}`,
      `价值观：${b.persona.values.join('、')}`,
      `座右铭：「${b.persona.motto ?? '无'}」`,
      `声望：${b.reputation}`,
      `人生大事（${b.timeline.length}件）：`,
    ];

    for (const event of b.timeline) {
      lines.push(`  - 第${event.year}年：${event.description}`);
    }

    if (b.obituary) {
      lines.push('');
      lines.push('── 讣告 ──');
      lines.push(`${agent.name} 于桃源镇 ${b.obituary.year} 年逝世，享年 ${b.obituary.age} 岁。`);
      lines.push(b.obituary.summary);
      lines.push(`最被人记住：${b.obituary.legacy}`);
    }

    return lines.join('\n');
  }
}
