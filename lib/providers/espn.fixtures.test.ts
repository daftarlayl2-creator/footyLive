/**
 * Regression tests against REAL captured ESPN summary payloads (kept in
 * `__fixtures__/`) — they exercise the exact shape ESPN returns in production:
 *   • `boxscore.teams[]` entries without a `homeAway` flag,
 *   • statistics rows without a `label`,
 *   • `keyEvents[]` with `type.text` + `clock.displayValue`,
 *   • a summary with no `header` at all.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEspnBoxscoreTeams, parseEspnCommentary, prettifyStatName } from './espn';

const fixturesDir = join(__dirname, '__fixtures__');
const laliga = JSON.parse(readFileSync(join(fixturesDir, 'espn-summary-laliga.json'), 'utf8'));
const seriea = JSON.parse(readFileSync(join(fixturesDir, 'espn-summary-seriea.json'), 'utf8'));

describe('captured ESPN summary payloads', () => {
  it('maps the La Liga boxscore without relying on upstream labels', () => {
    const home = { name: 'Valencia', badge: 'val.png' };
    const away = { name: 'Getafe', badge: 'get.png' };
    const teams = parseEspnBoxscoreTeams(laliga.boxscore, home, away);

    // Header is absent in this capture, so ESPN's "home first" convention wins.
    expect(teams).toHaveLength(2);
    expect(teams[0].team.displayName).toBe('Valencia');
    expect(teams[1].team.displayName).toBe('Getafe');

    const labels = teams[0].statistics.map((s: any) => s.label);
    expect(labels).toContain('Fouls');
    expect(labels).toContain('Corner Kicks');
    expect(labels).toContain('Possession');
    expect(labels).toContain('Shots on Target');
    // Key comparison rows come first.
    expect(labels[0]).toBe('Possession');
    expect(labels[1]).toBe('Shots');

    const possession = teams[0].statistics.find((s: any) => s.name === 'possessionPct');
    expect(Number.parseFloat(possession.displayValue)).toBeGreaterThan(0);
    expect(possession.percentage + teams[1].statistics.find((s: any) => s.name === 'possessionPct').percentage).toBe(100);

    const fouls = teams[0].statistics.find((s: any) => s.name === 'foulsCommitted');
    expect(fouls.displayValue).toBe('9');
    expect(teams[1].statistics.find((s: any) => s.name === 'foulsCommitted').displayValue).toBeDefined();
  });

  it('resolves home/away from the summary header when the boxscore omits it', () => {
    const [juve] = seriea;
    const teams = parseEspnBoxscoreTeams(
      juve.boxscore,
      { name: 'Juventus', badge: '' },
      { name: 'Atalanta', badge: '' },
      juve.header
    );
    expect(teams[0].team.displayName).toBe('Juventus');
    expect(teams[1].team.displayName).toBe('Atalanta');
    // 28 real stat rows captured from ESPN.
    expect(teams[0].statistics.length).toBeGreaterThan(20);
  });

  it('parses the captured key events into play-by-play rows', () => {
    const commentary = parseEspnCommentary(laliga);
    expect(commentary.length).toBeGreaterThan(10);

    const yellow = commentary.find((c: any) => c.type === 'Yellow Card');
    expect(yellow).toBeTruthy();
    expect(yellow.time.displayValue).toBe("11'");
    expect(yellow.text).toContain('yellow card');

    // Every row carries a type, text and a time container for the UI.
    for (const row of commentary) {
      expect(row).toHaveProperty('type');
      expect(typeof row.text).toBe('string');
      expect(row.time).toHaveProperty('displayValue');
    }
  });

  it('derives human labels for stat names ESPN did not label', () => {
    expect(prettifyStatName('totalShots')).toBe('Shots');
    expect(prettifyStatName('wonCorners')).toBe('Corner Kicks');
    expect(prettifyStatName('someUnknownMetric')).toBe('Some Unknown Metric');
    expect(prettifyStatName('unknownPct')).toBe('Unknown Percentage');
  });
});
