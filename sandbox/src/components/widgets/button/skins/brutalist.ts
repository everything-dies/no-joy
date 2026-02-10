import { css } from '@everything-dies/flesh-cage'

export default css`
  :host {
    display: block;
  }
  button {
    background: #000;
    color: #0f0;
    border: 3px solid #0f0;
    padding: 10px 24px;
    font-family: monospace;
    font-size: 16px;
    text-transform: uppercase;
    cursor: pointer;
  }
  button:hover {
    background: #0f0;
    color: #000;
  }
  p {
    color: #0f0;
    font-family: monospace;
  }
  dl {
    background: #1a1a1a;
    border: 2px solid #f00;
    padding: 12px;
    color: #f00;
    font-family: monospace;
  }
  dt {
    font-weight: bold;
    text-transform: uppercase;
  }
  pre {
    background: #000;
    color: #0f0;
    padding: 8px;
    overflow: auto;
  }
`
