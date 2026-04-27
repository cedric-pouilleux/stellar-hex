/**
 * Physical surface classifications — pure body domain, no game or resource system dependency.
 * `features/resources` imports from here, not the other way around.
 */

/** Discriminant for all planetary body categories. */
export type BodyType = 'rocky' | 'gaseous' | 'metallic' | 'star'
