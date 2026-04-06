import React from 'react';
import { useStore } from '@/store';

/**
 * Props for the Logo component.
 */
interface LogoProps {
    /** Logo size in pixels (default: 64) */
    size?: number;
    /** Additional CSS classes to apply */
    className?: string;
}

/**
 * FlowMeter application logo with theme-aware styling.
 *
 * Renders an inline SVG logo featuring a geometric 4-element wavy pattern design.
 * The logo automatically adapts its color based on the current theme:
 * - Light mode: Dark gray (#1f1f1f)
 * - Dark mode: Light gray (#e0e0e0)
 *
 * The design consists of four wave path elements arranged with different rotations
 * (90°, 0°, -90°, 0° offset) to create a unified visual pattern.
 *
 * Features:
 * - Theme-aware color switching with smooth transitions (0.4s ease)
 * - Scalable vector graphics (SVG) that maintains quality at any size
 * - 337x337 viewBox with configurable rendered size
 * - CSS transition for smooth color changes when toggling themes
 *
 * @example
 * ```tsx
 * <Logo size={48} className="mr-2" />
 * ```
 *
 * @example
 * ```tsx
 * <Logo size={128} /> // Large logo for splash screen
 * ```
 */
export const Logo: React.FC<LogoProps> = ({ size = 64, className = '' }) => {
    const isDarkMode = useStore((state) => state.isDarkMode);

    // Colors that adapt to theme
    const fillColor = isDarkMode ? '#e0e0e0' : '#1f1f1f';

    // Transition for smooth color changes
    const pathStyle = { fill: fillColor, transition: 'fill 0.4s ease-in-out' };

    // The wave path used by all 4 elements
    const wavePath = "M7676.315,2440.926L7676.315,2421.246C7691.453,2421.246 7699.954,2414.282 7707.717,2406.891C7713.267,2401.606 7718.518,2396.016 7724.159,2390.81C7741.307,2374.985 7761.307,2362.191 7794.425,2362.191L7794.425,2381.871C7761.384,2381.871 7744.671,2397.846 7728.245,2414.291C7715.184,2427.368 7702.412,2440.926 7676.315,2440.926ZM7794.425,2401.593L7794.425,2421.274C7779.129,2421.274 7770.521,2428.231 7762.713,2435.65C7757.167,2440.919 7751.935,2446.493 7746.324,2451.684C7729.189,2467.538 7709.273,2480.329 7676.315,2480.329L7676.315,2460.649C7709.149,2460.649 7725.767,2444.681 7742.199,2428.228C7755.266,2415.146 7768.14,2401.593 7794.425,2401.593Z";

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 337 337"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ overflow: 'visible', fillRule: 'evenodd', clipRule: 'evenodd', strokeLinejoin: 'round', strokeMiterlimit: 2 }}
        >
            <g transform="matrix(1,0,0,1,-8236.24075,-3104.714895)">
                {/* Wave element 1 - rotated 90° */}
                <g transform="matrix(1,0,0,1,-0.850394,0)">
                    <g transform="matrix(0,1.424261,-1.424261,0,11769.728309,-7660.084722)">
                        <path d={wavePath} style={pathStyle} />
                    </g>
                </g>
                {/* Wave element 2 - normal orientation */}
                <g transform="matrix(1,0,0,1,-0.850394,0)">
                    <g transform="matrix(1.424261,0,0,1.424261,-2527.748659,-91.422271)">
                        <path d={wavePath} style={pathStyle} />
                    </g>
                </g>
                {/* Wave element 3 - rotated -90° */}
                <g transform="matrix(1,0,0,1,-0.850394,0)">
                    <g transform="matrix(0,-1.424261,1.424261,0,5040.933885,14206.094884)">
                        <path d={wavePath} style={pathStyle} />
                    </g>
                </g>
                {/* Wave element 4 - normal orientation, offset */}
                <g transform="matrix(1,0,0,1,-0.850394,0)">
                    <g transform="matrix(1.424261,0,0,1.424261,-2695.948427,-259.662224)">
                        <path d={wavePath} style={pathStyle} />
                    </g>
                </g>
            </g>
        </svg>
    );
};
