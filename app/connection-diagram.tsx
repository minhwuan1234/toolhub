'use client';

import { useState, type CSSProperties } from 'react';
import {
  Users,
  BriefcaseBusiness,
  Clapperboard,
  ListChecks,
  UserRound,
  Megaphone,
  Pause,
  Play,
} from 'lucide-react';

export const departments = [
  'Account',
  'Business Development',
  'Production',
  'Project Management',
  'HR',
  'Andy Tran',
  'Marketing',
] as const;

const nodes = [
  {
    name: departments[0],
    x: 28,
    y: 102,
    width: 154,
    color: '#ffe8d4',
    ink: '#793400',
    icon: Users,
    path: 'M182 133H211Q239 133 239 161V277',
  },
  {
    name: departments[1],
    x: 334,
    y: 48,
    width: 236,
    color: '#dcecfa',
    ink: '#005bab',
    icon: BriefcaseBusiness,
    path: 'M452 110V158Q452 188 421 188H356Q330 188 330 216V277',
  },
  {
    name: departments[2],
    x: 396,
    y: 225,
    width: 176,
    color: '#d9f3e1',
    ink: '#236b3b',
    icon: Clapperboard,
    path: 'M396 256H387Q365 256 365 282V313',
  },
  {
    name: departments[3],
    x: 352,
    y: 410,
    width: 232,
    color: '#fef7d6',
    ink: '#793400',
    icon: ListChecks,
    path: 'M352 441H342Q321 441 321 418V349',
  },
  {
    name: departments[4],
    x: 42,
    y: 454,
    width: 126,
    color: '#fde0ec',
    ink: '#a02e6d',
    icon: Users,
    path: 'M168 485H226Q258 485 258 454V349',
  },
  {
    name: departments[5],
    x: 12,
    y: 294,
    width: 166,
    color: '#f0eeec',
    ink: '#37352f',
    icon: UserRound,
    path: 'M178 325H225',
  },
  {
    name: departments[6],
    x: 224,
    y: 548,
    width: 180,
    color: '#e6e0f5',
    ink: '#391c57',
    icon: Megaphone,
    path: 'M314 548V518Q314 495 291 495V349',
  },
];

export function ConnectionDiagram({ selected }: { selected: string | null }) {
  const [paused, setPaused] = useState(false);
  return (
    <div className={`diagram-scene ${paused ? 'motion-paused' : ''}`}>
      <svg
        className="connection-art"
        viewBox="0 0 600 630"
        role="img"
        aria-labelledby="diagram-title"
      >
        <title id="diagram-title">
          Toolhub connects all seven departments. Decorative illustration, not
          live activity.
        </title>
        <defs>
          <pattern
            id="diagram-dots"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="0.8" fill="#d3d0cb" />
          </pattern>
        </defs>
        <rect width="600" height="630" fill="url(#diagram-dots)" />
        <g fill="none" strokeWidth="1.4">
          {nodes.map((node, index) => (
            <g
              key={node.name}
              className={
                selected === node.name ? 'connection selected' : 'connection'
              }
              style={{ '--delay': `${index * -0.9}s` } as CSSProperties}
            >
              <path d={node.path} className="connection-base" />
              <path
                d={node.path}
                pathLength="100"
                className="connection-flow"
              />
            </g>
          ))}
        </g>
        <g className="hub-halo">
          <rect
            x="211"
            y="263"
            width="188"
            height="100"
            rx="20"
            fill="none"
            stroke="#d5d1ca"
          />
        </g>
        <g>
          <rect
            x="225"
            y="277"
            width="160"
            height="72"
            rx="12"
            fill="#fff"
            stroke="#000"
            strokeWidth="1.5"
          />
          <image href="/notion.svg" x="244" y="300" width="26" height="26" />
          <text x="282" y="320" fill="#000" fontSize="20" fontWeight="650">
            toolhub
          </text>
        </g>
        {nodes.map((node, index) => (
          <g key={node.name} transform={`translate(${node.x} ${node.y})`}>
            <g
              className={`floating-node ${selected === node.name ? 'selected-node' : ''}`}
              style={{ '--delay': `${index * -0.7}s` } as CSSProperties}
            >
              <rect
                className="node-shadow"
                x="0"
                y="3"
                width={node.width}
                height="62"
                rx="10"
                fill="#37352f"
                opacity="0.035"
              />
              <rect
                className="node-frame"
                width={node.width}
                height="62"
                rx="10"
                fill="#fff"
                stroke="#d8d5cf"
              />
              <rect
                x="12"
                y="15"
                width="32"
                height="32"
                rx="7"
                fill={node.color}
              />
              <node.icon
                x="19"
                y="22"
                width="18"
                height="18"
                color={node.ink}
                strokeWidth="1.7"
              />
              <text x="55" y="36" fill="#37352f" fontSize="14" fontWeight="500">
                {node.name}
              </text>
            </g>
          </g>
        ))}
      </svg>
      <button
        className="motion-toggle"
        type="button"
        onClick={() => setPaused((v) => !v)}
        aria-label={
          paused ? 'Play diagram animation' : 'Pause diagram animation'
        }
        title={paused ? 'Play animation' : 'Pause animation'}
      >
        {paused ? <Play size={15} /> : <Pause size={15} />}
      </button>
    </div>
  );
}
