
import React from 'react';

/**
 * Props for the AnimatedLogo component.
 */
interface AnimatedLogoProps {
    /** Logo size in pixels (default: 64) */
    size?: number;
    /** Additional CSS classes to apply */
    className?: string;
}

/**
 * Animated FlowMeter logo with floating motion, sporadic rotation, and shimmer effects.
 *
 * An enhanced version of the Logo component featuring:
 * - **Floating Animation**: Gentle vertical oscillation (±6px over 6s)
 * - **Sporadic Spin**: Occasional 90° rotation at 75-95% of animation cycle
 * - **Shimmer Gradient**: Animated linear gradient using theme's primary accent color
 * - **Ambient Glow**: Subtle radial gradient halo with blur effect
 *
 * The logo uses the same geometric 4-element wavy pattern as the static Logo
 * but applies the primary theme color with shimmer effects created via SVG
 * linearGradient with animated stop-opacity values.
 *
 * Animation timing:
 * - logoFloat: 6s ease-in-out infinite (vertical movement)
 * - logoSporadicSpin: 6s ease-in-out infinite (rotation at 75-95%)
 * - Shimmer gradient: 3.5s infinite (opacity oscillation 0.7-1.0)
 *
 * Typically used for:
 * - Loading screens and splash pages
 * - Application startup indicators
 * - Onboarding wizards
 * - Empty states with branding emphasis
 *
 * @example
 * ```tsx
 * <AnimatedLogo size={128} className="mx-auto my-8" />
 * ```
 */
export const AnimatedLogo: React.FC<AnimatedLogoProps> = ({ size = 64, className = '' }) => {
    const accentColor = 'hsl(var(--primary))';

    // The wave path used by all 4 elements
    const wavePath = "M7676.315,2440.926L7676.315,2421.246C7691.453,2421.246 7699.954,2414.282 7707.717,2406.891C7713.267,2401.606 7718.518,2396.016 7724.159,2390.81C7741.307,2374.985 7761.307,2362.191 7794.425,2362.191L7794.425,2381.871C7761.384,2381.871 7744.671,2397.846 7728.245,2414.291C7715.184,2427.368 7702.412,2440.926 7676.315,2440.926ZM7794.425,2401.593L7794.425,2421.274C7779.129,2421.274 7770.521,2428.231 7762.713,2435.65C7757.167,2440.919 7751.935,2446.493 7746.324,2451.684C7729.189,2467.538 7709.273,2480.329 7676.315,2480.329L7676.315,2460.649C7709.149,2460.649 7725.767,2444.681 7742.199,2428.228C7755.266,2415.146 7768.14,2401.593 7794.425,2401.593Z";

    return (
        <div
            className={`relative ${className}`}
            style={{
                width: size,
                height: size,
                animation: 'logoFloat 6s ease-in-out infinite, logoSporadicSpin 6s ease-in-out infinite'
            }}
        >
            {/* Subtle ambient glow */}
            <div
                className="absolute rounded-full pointer-events-none"
                style={{
                    inset: -size * 0.12,
                    background: `radial-gradient(circle, ${accentColor} 0%, transparent 50%)`,
                    opacity: 0.15,
                    filter: 'blur(18px)',
                }}
            />

            <svg
                width={size}
                height={size}
                viewBox="0 0 337 337"
                xmlns="http://www.w3.org/2000/svg"
                style={{ overflow: 'visible', position: 'relative', zIndex: 1, fillRule: 'evenodd', clipRule: 'evenodd', strokeLinejoin: 'round', strokeMiterlimit: 2 }}
            >
                <defs>
                    {/* Shimmer gradient using accent color */}
                    <linearGradient id="accentShimmer" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={accentColor} stopOpacity="0.7">
                            <animate attributeName="stop-opacity" values="0.7;1;0.7" dur="3.5s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="50%" stopColor={accentColor} stopOpacity="1" />
                        <stop offset="100%" stopColor={accentColor} stopOpacity="0.7">
                            <animate attributeName="stop-opacity" values="1;0.7;1" dur="3.5s" repeatCount="indefinite" />
                        </stop>
                    </linearGradient>
                </defs>

                <g transform="matrix(1,0,0,1,-8236.24075,-3104.714895)">
                    {/* Wave element 1 - rotated 90° */}
                    <g transform="matrix(1,0,0,1,-0.850394,0)">
                        <g transform="matrix(0,1.424261,-1.424261,0,11769.728309,-7660.084722)">
                            <path d={wavePath} style={{ fill: 'url(#accentShimmer)' }} />
                        </g>
                    </g>
                    {/* Wave element 2 - normal orientation */}
                    <g transform="matrix(1,0,0,1,-0.850394,0)">
                        <g transform="matrix(1.424261,0,0,1.424261,-2527.748659,-91.422271)">
                            <path d={wavePath} style={{ fill: 'url(#accentShimmer)' }} />
                        </g>
                    </g>
                    {/* Wave element 3 - rotated -90° */}
                    <g transform="matrix(1,0,0,1,-0.850394,0)">
                        <g transform="matrix(0,-1.424261,1.424261,0,5040.933885,14206.094884)">
                            <path d={wavePath} style={{ fill: 'url(#accentShimmer)' }} />
                        </g>
                    </g>
                    {/* Wave element 4 - normal orientation, offset */}
                    <g transform="matrix(1,0,0,1,-0.850394,0)">
                        <g transform="matrix(1.424261,0,0,1.424261,-2695.948427,-259.662224)">
                            <path d={wavePath} style={{ fill: 'url(#accentShimmer)' }} />
                        </g>
                    </g>
                </g>
            </svg>

            <style>{`
                @keyframes logoFloat {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-6px); }
                }
                @keyframes logoSporadicSpin {
                    0%, 75% { transform: rotate(0deg); }
                    90% { transform: rotate(90deg); }
                    95%, 100% { transform: rotate(90deg); }
                }
            `}</style>
        </div>
    );
};
