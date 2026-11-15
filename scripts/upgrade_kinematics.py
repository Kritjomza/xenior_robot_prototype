from pathlib import Path
p=Path('apps/api/app/domain/kinematics.py')
s=p.read_text(); a=s.index('        total ='); b=s.index('        joints = JointAngles',a)
s=s[:a]+'''        # Work coordinates retain the existing home Z; geometry uses the motor plane.
        z = z_mm - self.geometry.home_pose.z_mm + self._home_z()
        r = (self.geometry.base_width_mm - self.geometry.moving_platform_width_mm) / (2 * math.sqrt(3))
        length = self.geometry.upper_arm_length_mm
        lower = self.geometry.lower_arm_length_mm
        result = []
        for angle in (0, 2 * math.pi / 3, 4 * math.pi / 3):
            radial = x_mm * math.cos(angle) + y_mm * math.sin(angle)
            tangent = -x_mm * math.sin(angle) + y_mm * math.cos(angle)
            u = radial - r
            c = (u*u + tangent*tangent + z*z + length*length - lower*lower) / (2*length)
            radius = math.hypot(u, z)
            if radius < 1e-9 or abs(c) > radius + 1e-9:
                raise KinematicsError("Cartesian target is geometrically unreachable")
            phase = math.atan2(-z, u)
            opening = math.acos(max(-1.0, min(1.0, c / radius)))
            candidates = [math.degrees((phase + sign*opening + math.pi) % (2*math.pi) - math.pi) for sign in (-1, 1)]
            valid = [v for v in candidates if self.geometry.joint_limits_deg[0] <= v <= self.geometry.joint_limits_deg[1]]
            if not valid:
                raise KinematicsError("joint target exceeds configured limit")
            result.append(min(valid, key=abs))
        j1, j2, j3 = result
''' +s[b:]
a=s.index('        j1, j2, j3 = checked.values_deg');b=s.index('        self._check_pose',a)
s=s[:a]+'''        # Three equal-radius spheres intersect at two points; choose the lower assembly.
        r = (self.geometry.base_width_mm - self.geometry.moving_platform_width_mm) / (2 * math.sqrt(3))
        centers = []
        for angle, joint in zip((0, 2*math.pi/3, 4*math.pi/3), checked.values_deg):
            theta = math.radians(joint)
            radius = r + self.geometry.upper_arm_length_mm * math.cos(theta)
            centers.append((radius*math.cos(angle), radius*math.sin(angle), -self.geometry.upper_arm_length_mm*math.sin(theta)))
        def sub(a, b): return tuple(x-y for x,y in zip(a,b))
        def dot(a, b): return sum(x*y for x,y in zip(a,b))
        def norm(a): return math.sqrt(dot(a,a))
        a, b, c = centers
        ab = sub(b,a); d = norm(ab)
        if d < 1e-9: raise KinematicsError("Singular joint configuration")
        ex = tuple(v/d for v in ab)
        ac = sub(c,a); i = dot(ex,ac)
        temp = tuple(v-i*w for v,w in zip(ac,ex)); j = norm(temp)
        if j < 1e-9: raise KinematicsError("Singular joint configuration")
        ey = tuple(v/j for v in temp)
        ez = (ex[1]*ey[2]-ex[2]*ey[1], ex[2]*ey[0]-ex[0]*ey[2], ex[0]*ey[1]-ex[1]*ey[0])
        x = d/2; y = (i*i+j*j-2*i*x)/(2*j)
        h2 = self.geometry.lower_arm_length_mm**2-x*x-y*y
        if h2 <= 1e-9: raise KinematicsError("Unreachable or singular joint configuration")
        points = [tuple(a[k]+x*ex[k]+y*ey[k]+sign*math.sqrt(h2)*ez[k] for k in range(3)) for sign in (-1,1)]
        x_mm, y_mm, z = min(points, key=lambda p:p[2])
        z_mm = z - self._home_z() + self.geometry.home_pose.z_mm
''' +s[b:]
a=s.index('    @staticmethod');s=s[:a]+'''    def _home_z(self) -> float:
        r = (self.geometry.base_width_mm - self.geometry.moving_platform_width_mm) / (2 * math.sqrt(3))
        h2 = self.geometry.lower_arm_length_mm**2 - (r + self.geometry.upper_arm_length_mm)**2
        if h2 <= 0:
            raise KinematicsError("Invalid simulation geometry")
        return -math.sqrt(h2)

'''+s[a:];s=s.replace('Deterministic linearized delta model for simulation and UI validation.','Geometric delta model with radial axes at 0, 120 and 240 degrees.');p.write_text(s)
p=Path('apps/api/app/adapters/mock.py');s=p.read_text().replace('from app.domain.commands', 'from app.domain.kinematics import DeltaGeometry, DeltaKinematics\nfrom app.domain.commands',1).replace('        self._state = RobotState()','        self._kinematics = DeltaKinematics(DeltaGeometry.simulation_defaults())\n        self._state = RobotState()',1).replace('            self._state.x_mm = command.x_mm','            joints = self._kinematics.inverse(command.x_mm, command.y_mm, command.z_mm)\n            self._state.joints_deg = list(joints.values_deg)\n            self._state.x_mm = command.x_mm');p.write_text(s)
