name: SafeMix
platform: mobile-first; web for portal & admin
theme: light (default), dark (opt-in)
colors:
  primary: [trustworthy clinical — blue/teal range]
  surface: [warm-white #FFF8F0 family — never pure #FFFFFF, never black]
  accentSafe: [Material Green 800 family — paired with ✓ icon]
  accentWarn: [Material Amber 800 family — paired with ⚠ icon]
  accentRisk: [Material Red 700 family — paired with ❗ icon]
  ayurvedic: [reserved saffron family — used only on AYUSH-context surfaces]
typography:
  primary: Noto Sans Devanagari + Roboto Flex (multi-script fallback chain)
  bodyEn: 16 sp regular; 20 sp in elderly mode
  bodyHi: 18 sp regular; 22 sp in elderly mode; line-height 1.7
  weights: Regular and Medium only — never Bold for Devanagari body
spacing: 4-8-12-16-24-32-48 dp scale
radius: sm 8 dp, md 12 dp, lg 20 dp; pill for primary CTAs
touchTarget: primary 56 dp, secondary 48 dp, gap 12 dp (elderly mode)

Do's:
- Always pair colour with icon + text label for safety alerts.
- Always show language picker as the FIRST onboarding screen.
- Always render QR full-screen at max brightness.

Don'ts:
- Never use colour alone for severity.
- Never use pure black surfaces (cultural sensitivity).
- Never gate safety verdicts behind paywall or login beyond phone OTP.
- Never use Bold weight on Devanagari body text.
