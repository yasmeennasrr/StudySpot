import { Inject, Injectable, Logger } from '@nestjs/common';
import { AdapterUnavailableError, AppError } from '../../common/errors/app-error';
import {
  CLOCK,
  LLM,
  type GeoPoint,
  type IClock,
  type ILLM,
  type IStudyMatch,
  type LlmTurn,
  type StudyMatchAnswer,
} from '../../contracts';
import { StudyMatchTools, type RecommendedVenue, type ToolContext } from './studymatch-tools';

/** SDS 7.2: 5 s per LLM call (ResilientLlm) inside a 9 s deadline for the whole request (AI-028). */
export const STUDYMATCH_DEADLINE_MS = 9_000;
export const LLM_CALL_LIMIT_MS = 5_000;
/** Tool rounds before we stop asking; a normal request needs one or two. */
export const MAX_ROUNDS = 4;
export const MAX_TOOL_CALLS_PER_ROUND = 5;
/** Below this there is no point starting another LLM call. */
const MIN_CALL_MS = 500;

const NEEDS_INFO_TAG = '[NEEDS_INFO]';
const OFF_TOPIC_TAG = '[OFF_TOPIC]';

/** Thrown when StudyMatch cannot get an answer from the LLM in time; step 6 turns it into standard results. */
export class StudyMatchUnavailable extends Error {
  constructor(public readonly reason: string) {
    super(`StudyMatch AI unavailable: ${reason}`);
    this.name = 'StudyMatchUnavailable';
  }
}

/**
 * The instructions Gemini gets with every request (SRS 3.8, SDS 6.6.8).
 * `now` and whether a location was shared change per request.
 */
export function buildSystemPrompt(now: Date, hasLocation: boolean): string {
  const cairo = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  return [
    'You are StudyMatch, the assistant of StudySpot, an app that helps university students in Cairo find places to study.',
    `It is now ${cairo} (Cairo time).`,
    hasLocation
      ? 'The student shared their location: tools use it automatically when you give no area.'
      : 'The student has NOT shared their location: use the area they name, or ask them which area they want.',
    '',
    'Rules:',
    '1. The student may write in English, Arabic or a mix. Always reply in English.',
    '2. Use only the tools for facts about places. Never invent a place, a condition, a price or a reason.',
    '3. To suggest places, call recommend_venues with the criteria the student asked for (noise, crowd, wifi, distance, price, openAt, outlets, studyType). Mark a criterion required only when they said need, must or has to. Their saved preferences are added automatically.',
    '4. Give each suggested place with the reasons the tool returned, briefly. Suggest at most 5.',
    '5. For crowd, noise and Wi-Fi always say the status the tool gives: "current" only when the status is current; "X hours ago" for hours_ago; "an estimate based on historical data" for historical. If a value is unavailable, say so.',
    '6. Crowd and noise are estimates. Never state a number of people.',
    `7. If you need more information to recommend anything (for example no area and no location), ask for it and start your reply with ${NEEDS_INFO_TAG}. If you assume something, say what you assumed.`,
    `8. If the message is not about finding or choosing a place to study, say you can only help with finding study places and start your reply with ${OFF_TOPIC_TAG}.`,
    '9. Keep replies short and friendly: a sentence or two, then the places.',
  ].join('\n');
}

/** Strips the reply tags and turns them into the reason code. */
export function readReply(text: string): {
  reply: string;
  reasonCode: StudyMatchAnswer['reasonCode'];
} {
  let reply = text.trim();
  let reasonCode: StudyMatchAnswer['reasonCode'] = 'OK';
  for (const [tag, code] of [
    [NEEDS_INFO_TAG, 'NEEDS_INFO'],
    [OFF_TOPIC_TAG, 'OFF_TOPIC'],
  ] as const) {
    if (reply.includes(tag)) {
      reasonCode = code;
      reply = reply.split(tag).join('').trim();
    }
  }
  return { reply, reasonCode };
}

/**
 * StudyMatch Orchestrator (PB-29, SDS 6.3, 7.2, UC-05). Owner: M2. Provides IStudyMatch.
 *
 * The LLM chooses tools; the backend runs them (StudyMatchTools) and sends the
 * results back, up to MAX_ROUNDS times, until the LLM writes the reply. The
 * recommendation cards come from the backend's own recommend_venues results,
 * so they always match real data (AI-013, AI-014).
 */
@Injectable()
export class StudyMatchService implements IStudyMatch {
  private readonly logger = new Logger('StudyMatch');

  constructor(
    @Inject(LLM) private readonly llm: ILLM,
    private readonly tools: StudyMatchTools,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async ask(input: {
    userId: string;
    text: string;
    location?: GeoPoint;
  }): Promise<StudyMatchAnswer> {
    const text = input.text.trim();
    if (!text) throw AppError.invalidInput('Type what kind of study place you are looking for.');
    return this.converse({ userId: input.userId, location: input.location }, text);
  }

  /** The tool loop. Throws StudyMatchUnavailable when the LLM fails or time runs out. */
  async converse(ctx: ToolContext, text: string): Promise<StudyMatchAnswer> {
    const started = this.clock.now().getTime();
    const deadline = started + STUDYMATCH_DEADLINE_MS;
    const system = buildSystemPrompt(this.clock.now(), !!ctx.location);
    const turns: LlmTurn[] = [{ role: 'user', text }];
    let recommended: RecommendedVenue[] = [];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const left = deadline - this.clock.now().getTime();
      if (left < MIN_CALL_MS) throw new StudyMatchUnavailable('deadline');
      let answer: LlmTurn;
      try {
        answer = await this.llm.generate({
          system,
          turns,
          tools: this.tools.definitions,
          timeoutMs: Math.min(LLM_CALL_LIMIT_MS, left),
        });
      } catch (err) {
        const reason = err instanceof AdapterUnavailableError ? err.reason : String(err);
        throw new StudyMatchUnavailable(reason);
      }

      const calls = answer.toolCalls ?? [];
      if (calls.length === 0) {
        if (!answer.text) throw new StudyMatchUnavailable('empty answer');
        const { reply, reasonCode } = readReply(answer.text);
        this.logger.log(
          {
            userId: ctx.userId,
            rounds: round + 1,
            reasonCode,
            ms: this.clock.now().getTime() - started,
          },
          'StudyMatch answered',
        );
        return {
          reply,
          recommendations: reasonCode === 'OK' ? recommended : [],
          degraded: false,
          reasonCode,
        };
      }

      turns.push(answer);
      for (const [i, call] of calls.entries()) {
        const outcome =
          i < MAX_TOOL_CALLS_PER_ROUND
            ? await this.tools.run(call.name, call.arguments, ctx)
            : ({
                ok: false,
                error: { code: 'NOT_ALLOWED', message: 'Too many operations at once.' },
              } as const);
        if (outcome.ok && outcome.recommended) recommended = outcome.recommended;
        turns.push({
          role: 'tool',
          toolResult: {
            name: call.name,
            result: outcome.ok ? outcome.result : { error: outcome.error },
          },
        });
      }
    }
    throw new StudyMatchUnavailable('too many tool rounds');
  }
}
