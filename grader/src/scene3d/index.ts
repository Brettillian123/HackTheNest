import { SceneBuildError, type SceneData } from './types';
import { failedResult, prepareScene, scoreScene, type PreparedScene, type SceneGradeResult } from './score';
import { ThreeSceneRunner, type ThreeRunnerOptions } from './three-runner';

/**
 * The 3D grader. A submission is JavaScript defining
 * `function buildScene(THREE) { ...; return object; }`; the goal is the
 * same kind of file. Two stages, kept apart so another language can feed
 * the second one:
 *
 *   1. code -> triangles   (ThreeSceneRunner, in a locked-down browser page)
 *   2. triangles -> views and a score   (prepareScene / scoreScene, in Node)
 */

export { SCENE_LIMITS, SCENE_VERSION } from './config';
export { SceneBuildError } from './types';
export type { SceneData, SceneMesh, Bounds } from './types';
export type { PreparedScene, SceneGradeResult, SceneView, SceneDetails, EngineeringMeasure } from './score';
export { measureScene, prepareScene, scoreScene } from './score';
export type { SceneCriterion } from './score';
export { combineScene, scenesModel, type SceneMeasurements } from './model';
export { ThreeSceneRunner } from './three-runner';

export class SceneGrader {
  private readonly runner: ThreeSceneRunner;

  constructor(options: ThreeRunnerOptions = {}) {
    this.runner = new ThreeSceneRunner(options);
  }

  /** Turns code into triangles only. Throws SceneBuildError with a plain reason when it cannot. */
  build(code: string): Promise<SceneData> {
    return this.runner.run(code);
  }

  /** Builds and draws a goal. Throws if the goal itself is unusable. */
  async prepare(code: string): Promise<PreparedScene> {
    return prepareScene(await this.runner.run(code));
  }

  /** Grades a submission against a goal. Never throws for a bad submission: it scores 0 with a reason. */
  async grade(
    goal: string | PreparedScene,
    candidateCode: string,
  ): Promise<{ result: SceneGradeResult; candidate: PreparedScene | null }> {
    const prepared = typeof goal === 'string' ? await this.prepare(goal) : goal;
    let scene: SceneData;
    try {
      scene = await this.runner.run(candidateCode);
    } catch (error) {
      const reason =
        error instanceof SceneBuildError
          ? error.message
          : `The scene could not be built: ${error instanceof Error ? error.message : String(error)}`;
      return { result: failedResult(prepared, reason), candidate: null };
    }
    return scoreScene(prepared, scene);
  }

  close(): Promise<void> {
    return this.runner.close();
  }
}
