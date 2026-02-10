import { css } from '@everything-dies/flesh-cage'

export default css`
  :host {
    display: block;
  }
  button {
    background: #1976d2;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 10px 24px;
    font-size: 16px;
    cursor: pointer;
    transition: background 0.2s;
  }
  button:hover {
    background: #1565c0;
  }
  p {
    color: #666;
    font-style: italic;
  }
  dl {
    background: #fff3e0;
    border-left: 4px solid #e65100;
    padding: 12px;
    border-radius: 4px;
  }
  dt {
    font-weight: bold;
    color: #e65100;
  }
  pre {
    background: #f5f5f5;
    padding: 8px;
    border-radius: 4px;
    overflow: auto;
  }
`
