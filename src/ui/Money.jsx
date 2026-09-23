import { Icon } from './Icon.jsx';
import { euro } from './icons.js';
import { fmtFigure } from './format.js';

// Value (Figma): the Euro icon + 4px gap + the figure. Other currencies keep the trailing code.
export function Money({ value, currency }) {
  const sign = value < 0 ? '-' : '';
  if (currency === 'EUR') {
    return <span className="money">{sign}<span className="money-ic"><Icon icon={euro} size={12} /></span><span>{fmtFigure(value)}</span></span>;
  }
  return <span className="money">{`${sign}${fmtFigure(value)} ${currency === 'SEK' ? 'kr' : currency}`}</span>;
}
