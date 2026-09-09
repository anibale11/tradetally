const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

// Repos montados de solo lectura (ver docker-compose.yaml) — allowlist fija,
// nunca se arma la ruta a partir de input del usuario.
const REPOS = {
  'bot-trading': { path: '/repos/bot-trading', label: 'bot_trading (BingX)', githubUrl: 'https://github.com/anibale11/bot_trading' },
  'nautilus-trading': { path: '/repos/nautilus-trading', label: 'nautilus-trading (OKX)', githubUrl: 'https://github.com/anibale11/nautilus-trading' },
};

const SEP = '\x1f'; // unit separator — no aparece en mensajes de commit reales
const LOG_FORMAT = `%H${SEP}%ai${SEP}%an${SEP}%s`;

function parseLog(stdout) {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, date, author, subject] = line.split(SEP);
      return { hash, short_hash: hash.slice(0, 7), date, author, subject };
    });
}

module.exports = {
  /**
   * Historial de cambios real (git log) de bot_trading o nautilus-trading
   * — lee directo del repo montado de solo lectura, no de un archivo
   * exportado (siempre al día, sin proceso intermedio que mantener).
   */
  async getChangelog(req, res, next) {
    try {
      const repoKey = String(req.params.repo || '');
      const repo = REPOS[repoKey];
      if (!repo) {
        return res.status(400).json({ error: `Repo no soportado. Válidos: ${Object.keys(REPOS).join(', ')}` });
      }
      const limit = Math.min(Number(req.query.limit) || 100, 300);

      const { stdout } = await execFileAsync('git', [
        '-C', repo.path,
        'log', `--pretty=format:${LOG_FORMAT}`, `-n`, String(limit),
      ]);

      res.json({
        repo: repoKey,
        label: repo.label,
        github_url: repo.githubUrl,
        commits: parseLog(stdout),
      });
    } catch (error) {
      console.error('[CHANGELOG] Failed to read git log:', error);
      next(error);
    }
  },
};
