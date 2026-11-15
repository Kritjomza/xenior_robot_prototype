# Proposal kinematics review and website calculation report

Reviewed: 7 November 2026. Source: 7201_7204_7208_7215_propRep.pdf, PDF pages 7–8 and 13–14. Equation typography on page 14 was checked against a rendered page. Scope: ideal rigid-link position kinematics, not dynamics or hardware certification.

## Verdict
The inverse-kinematics half-angle algebra is correct. The displayed first-arm coefficients are consistent with a particular arm orientation and angle convention, but the proposal does not specify enough frame detail or coefficients for all arms to serve as a complete software specification. The forward-kinematics discussion is conceptually valid but incomplete: it provides no explicit FK calculation, and sphere centers require platform attachment offsets when the unknown is the platform center. Do not treat the document as a fully validated implementation specification without these additions.

## 1. Review of proposal equations
On page 14 the proposal gives E cos(theta)+F sin(theta)+G=0. Substituting t=tan(theta/2), cos(theta)=(1-t²)/(1+t²), sin(theta)=2t/(1+t²), and multiplying by 1+t² gives:

(G-E)t²+2Ft+(G+E)=0.

t=[-F ± sqrt(E²+F²-G²)]/(G-E), theta=2 atan(t).

These equations are algebraically correct, including the signs and discriminant. E, F and G have dimensions of length squared; t is dimensionless. Trigonometric functions use radians; degree conversion is a separate operation.

The stated coefficients E1=2L(y+a), F1=2zL, G1=x²+y²+z²+a²+L²+2ya-l² follow by expanding:

x²+(y+a+L cos(theta1))²+(z+L sin(theta1))²=l².

Thus they are correct for an arm whose shifted elbow is (0,-a-L cos(theta1),-L sin(theta1)). They cannot be copied directly into a solver whose first arm points along positive X. The explanation of a=wB-uP should call it the difference of the relevant attachment radii, not the separation between the centers of two platforms. Base/platform dimensions must refer to actual joint locations. Inradius, circumradius and triangle side length are not interchangeable.

Missing cases and corrections:
- G=E makes the printed division invalid. Solve the reduced linear equation when F is nonzero and also check theta=pi, which finite t cannot represent. If E=F=G=0 the equation alone does not determine an angle.
- E²+F²-G²<0 means no real solution, apart from a numerical tolerance near zero. A zero discriminant gives a repeated root and warrants singularity handling.
- The ± sign does not universally identify knee-out. Classify the physical configuration, enforce joint limits, and preserve the previous branch to prevent jumps.
- Page 8 describes three spheres centered at elbow tips. For platform-center FK, the centers must instead be elbow positions minus the corresponding platform attachment vectors. Unshifted elbow centers would locate individual attachment points rather than a common platform-center point.
- Closed-form arithmetic is subject to floating-point error. The page-14 claim of computation below 1 ms requires a measured benchmark on the intended controller; it does not follow from the equations.

## 2. Website coordinate and dimension contract
The current solver uses arm azimuths alpha=(0,120,240) degrees. Z is positive upward; theta=0 means a horizontal upper arm, with positive theta lowering the elbow. All lengths are mm. Define:

R=f/(2 sqrt(3)), r=e/(2 sqrt(3)), d=R-r.

Here f and e are the configured equilateral-triangle side lengths and R,r are the assumed joint-circle radii corresponding to those inradii. This assumption must be confirmed from CAD; use measured radii if attachments are not side midpoints.

Current simulation values: f=340, e=120, L=180, l=420. Hence R=98.149546, r=34.641016, d=63.508530 mm. These are defaults, not measurements from the STEP assembly.

At zero joint angles the geometric home is:

z0=-sqrt(l²-(d+L)²)=-342.204026871 mm.

The website retains work home Z=-200 mm. Conversion is z_geometric=z_work+200+z0. X and Y are unchanged. This explicit offset prevents confusing work coordinates with the motor-plane frame. The current home calibration assumes all three home angles are zero.

## 3. Website inverse kinematics
For each arm i define radial and tangential target coordinates:

q_i=x cos(alpha_i)+y sin(alpha_i)
s_i=-x sin(alpha_i)+y cos(alpha_i)
u_i=q_i-d.

The shifted elbow center is C_i=((d+L cos(theta_i))cos(alpha_i),(d+L cos(theta_i))sin(alpha_i),-L sin(theta_i)). The rigid-link constraint is:

(u_i-L cos(theta_i))²+s_i²+(z+L sin(theta_i))²=l².

Its EFG coefficients in this frame are:

E_i=-2L u_i
F_i=2L z
G_i=u_i²+s_i²+z²+L²-l².

A useful equivalent solution, used by the website, avoids the half-angle denominator:

c_i=G_i/(2L)
h_i=hypot(u_i,z)
phi_i=atan2(-z,u_i)
theta_i=phi_i ± acos(c_i/h_i).

Normalize to the intended angular interval, check h_i>0 and |c_i|<=h_i, and enforce joint limits. The current code chooses the valid candidate nearest zero; continuous trajectory branch tracking is still recommended. A single local discriminant does not provide a full parallel-singularity analysis.

## 4. Website forward kinematics
Calculate C1,C2,C3 as above. Solve |P-C_i|²=l² for P=(x,y,z). This is the corrected three-sphere formulation.

Let D=|C2-C1|, ex=(C2-C1)/D, v=C3-C1, I=ex dot v, J=|v-I ex|, ey=(v-I ex)/J and ez=ex cross ey. Then:

X=D/2
Y=(I²+J²-2IX)/(2J)
H²=l²-X²-Y²
P±=C1+X ex+Y ey ± sqrt(H²) ez.

Reject D or J near zero. Negative H² indicates no real intersection; H²=0 is a repeated intersection. The website rejects that boundary and chooses the solution with lower world Z for its intended assembly mode. Convert geometric Z back to work Z afterward. Lower Z is an assembly convention, not a universal branch rule for arbitrary joint configurations.

## 5. Reproducible worked calculations
Executed against apps/api/app/domain/kinematics.py:

| Work target XYZ (mm) | IK angles (degrees) | FK result XYZ (mm) |
| --- | --- | --- |
| (0,0,-200) | (0,0,0) | (0,0,-200) |
| (60,-30,-220) | (-4.679202414,19.440806080,8.934433867) | (60,-30,-220) |
| (-50,70,-240) | (24.495502769,-2.214621731,21.830408779) | (-50,70,-240) |

For the second row, geometric Z=-362.204026871 mm. Substituting the angles into all three sphere constraints gives the configured 420 mm forearm length. FK recovery errors in the printed calculations are below 1e-12 mm; this is floating-point consistency, not robot positioning accuracy. Existing test coverage additionally checks four target round trips and forearm closure with 1e-7 mm tolerance. The previous implementation pass recorded 178 backend tests passing and 2 skipped; that full suite was not rerun for this report-only change.

## 6. Application and recommended next steps
Use this frame contract in the backend, firmware and schematic. Bind CAD components only after identifying actual motor axes and link attachment centers. Validate measured dimensions, encoder signs, zero offsets and tool offset. Keep XYZ platform translation separate from an independently actuated tool yaw; an offset tool may require a yaw-dependent TCP transform.

Before hardware execution, add previous-state branch continuity, full Jacobian conditioning checks, path sampling, velocity/acceleration limits and collision validation. Verify independent measured poses rather than relying solely on IK/FK agreement. No website calculation changes were made during this document review.

## Sources
- User proposal: PDF pages 7–8, 13–14; extracted and visually checked as described above.
- Primary reference identified in the proposal: R. L. Williams II, The Delta Parallel Robot: Kinematics Solutions (2016), https://sites.ohio.edu/williams/html/PDF/DeltaKin.pdf . The algebra and website derivation above were independently expanded; no claim of a page-by-page audit of that external paper is made.
- Repository: apps/api/app/domain/kinematics.py; apps/api/tests/domain/test_kinematics.py; apps/web/src/workspace/deltaScenePose.ts.
