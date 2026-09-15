export type CommandType = 'home' | 'set_speed' | 'move_xyz' | 'grip' | 'wait' | 'release' | 'stop'
export type RobotCommand = { id: string; type: CommandType; [key: string]: string | number | null }
export type RobotProgram = { version: 1; name: string; commands: RobotCommand[] }

export function programToDsl(program: RobotProgram): string {
  return program.commands.map(command => {
    switch (command.type) {
      case 'home': return 'home()'
      case 'set_speed': return `set_speed(${command.speed_mm_s})`
      case 'move_xyz': return `move_to(x=${command.x_mm}, y=${command.y_mm}, z=${command.z_mm}${command.speed_mm_s == null ? '' : `, speed=${command.speed_mm_s}`})`
      case 'grip': return 'grip()'
      case 'wait': return `wait(${command.seconds})`
      case 'release': return 'release()'
      case 'stop': return 'stop()'
    }
  }).join('\n')
}

export function dslToProgram(lines: string[], name = 'Untitled program'): RobotProgram {
  const commands: RobotCommand[] = []
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim()
    if (!line) continue
    const id = `line-${index + 1}`
    const match = /^([a-z_]+)\((.*)\)$/.exec(line)
    if (!match) throw new Error(`line ${index + 1}: unsupported syntax`)
    const [, call, args] = match
    if (call === 'home' || call === 'grip' || call === 'release' || call === 'stop') {
      if (args) throw new Error(`line ${index + 1}: ${call} takes no arguments`)
      commands.push({ id, type: call })
    } else if (call === 'set_speed' || call === 'wait') {
      const value = Number(args)
      if (!Number.isFinite(value)) throw new Error(`line ${index + 1}: numeric argument required`)
      commands.push(call === 'set_speed' ? { id, type: 'set_speed', speed_mm_s: value } : { id, type: 'wait', seconds: value })
    } else if (call === 'move_to') {
      const values: Record<string, number> = {}
      for (const part of args.split(',').map(value => value.trim()).filter(Boolean)) {
        const [key, value] = part.split('=').map(item => item.trim())
        if (!key || !Number.isFinite(Number(value))) throw new Error(`line ${index + 1}: invalid move_to argument`)
        values[key] = Number(value)
      }
      if (!['x', 'y', 'z'].every(key => key in values)) throw new Error(`line ${index + 1}: move_to requires x, y, and z`)
      commands.push({ id, type: 'move_xyz', x_mm: values.x, y_mm: values.y, z_mm: values.z, speed_mm_s: values.speed ?? null })
    } else throw new Error(`line ${index + 1}: unsupported call`)
  }
  if (!commands.length) throw new Error('program must contain at least one command')
  return { version: 1, name, commands }
}

export function programToBlockly(program: RobotProgram): { blocks: RobotCommand[] } {
  return { blocks: program.commands.map(command => ({ ...command })) }
}

export function blocklyToProgram(workspace: { blocks: RobotCommand[] }, name = 'Untitled program'): RobotProgram {
  if (!workspace.blocks.length) throw new Error('Blockly workspace must contain at least one block')
  return { version: 1, name, commands: workspace.blocks.map(block => ({ ...block })) }
}
