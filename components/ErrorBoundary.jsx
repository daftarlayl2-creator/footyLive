'use client';

import { Component } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

/**
 * Resilient section-level error boundary.
 *
 * Wraps critical UI islands (Match Grid, Lineup Field, Rewards Drawer, Inbox,
 * Multi-View, the player stages …) so a single API glitch or render bug can
 * never take down the whole page: the boundary swaps just its own subtree for a
 * small, branded recovery card with a "Try again" reset. Everything outside the
 * boundary — navigation, scoreboards, the rest of the dashboard — keeps working.
 *
 * `resetKeys` re-opens the subtree automatically whenever the inputs it was
 * rendering change (e.g. a new match id), so a recovered API never leaves a
 * stale error card on screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, attempt: 0 };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the failure visible to operators without crashing the render.
    if (typeof console !== 'undefined') {
      console.error(`[Limon Live] ${this.props.name || 'section'} crashed`, error, info);
    }
    if (typeof this.props.onError === 'function') this.props.onError(error, info);
  }

  componentDidUpdate(previous) {
    const { resetKeys } = this.props;
    if (!this.state.error || !Array.isArray(resetKeys)) return;
    const before = Array.isArray(previous.resetKeys) ? previous.resetKeys : [];
    const changed = resetKeys.length !== before.length || resetKeys.some((key, index) => key !== before[index]);
    if (changed) this.reset();
  }

  reset() {
    this.setState((current) => ({ error: null, attempt: current.attempt + 1 }));
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (typeof this.props.fallback === 'function') {
      return this.props.fallback({ error, reset: this.reset });
    }
    return (
      <div
        role="alert"
        data-section-error={this.props.name || 'section'}
        className="glass-panel flex flex-col items-center justify-center gap-3 rounded-2xl p-6 text-center"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10">
          <ShieldAlert className="h-5 w-5 text-amber-400" aria-hidden="true" />
        </span>
        <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
          {this.props.title || 'This section hit a snag'}
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {this.props.message || 'A temporary glitch interrupted this panel. The rest of the page is still running — try loading just this section again.'}
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="tactile inline-flex items-center gap-1.5 rounded-xl border border-lime-500/40 bg-lime-500/10 px-4 py-2 text-xs font-extrabold text-lime-700 transition-colors hover:bg-lime-500/20 dark:text-lime-300"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }
}
