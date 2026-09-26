/**
 * @file BehaviorTree — a small behaviour-tree toolkit for enemy AI.
 * Nodes return SUCCESS, FAILURE or RUNNING each tick; composites remember
 * the running child. Leaves are plain functions of (agent, dt) so enemy
 * types compose their behaviour from shared building blocks.
 */

export const SUCCESS = 1;
export const FAILURE = 2;
export const RUNNING = 3;

/** Runs children in order until one does not fail. */
export function selector(...children) {
  return { type: 'selector', children, running: -1 };
}

/** Runs children in order until one does not succeed. */
export function sequence(...children) {
  return { type: 'sequence', children, running: -1 };
}

/** Leaf: fn(agent) → boolean. */
export function condition(fn, label = '') {
  return { type: 'condition', fn, label };
}

/** Leaf: fn(agent, dt) → SUCCESS | FAILURE | RUNNING. */
export function action(fn, label = '') {
  return { type: 'action', fn, label };
}

/** Tick a (sub)tree. Records the last running leaf label on the agent. */
export function tick(node, agent, dt) {
  switch (node.type) {
    case 'condition':
      return node.fn(agent) ? SUCCESS : FAILURE;
    case 'action': {
      const r = node.fn(agent, dt);
      if (r === RUNNING && node.label) agent.btState = node.label;
      return r;
    }
    case 'selector': {
      for (let i = 0; i < node.children.length; i++) {
        // Higher-priority branches are re-evaluated every tick (reactive).
        const r = tick(node.children[i], agent, dt);
        if (r === RUNNING) {
          node.running = i;
          return RUNNING;
        }
        if (r === SUCCESS) {
          node.running = -1;
          return SUCCESS;
        }
      }
      node.running = -1;
      return FAILURE;
    }
    case 'sequence': {
      for (let i = 0; i < node.children.length; i++) {
        const r = tick(node.children[i], agent, dt);
        if (r !== SUCCESS) {
          node.running = r === RUNNING ? i : -1;
          return r;
        }
      }
      node.running = -1;
      return SUCCESS;
    }
    default:
      return FAILURE;
  }
}
