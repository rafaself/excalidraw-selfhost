export type EquationData = {
  version: 1;
  latex: string;
};

export type EquationRenderResult = {
  latex: string;
  svg: string;
  width: number;
  height: number;
};

export type EquationScenePosition = {
  x: number;
  y: number;
};

export type EquationViewportPosition = {
  x: number;
  y: number;
};

export type EquationPlacement = {
  scenePosition: EquationScenePosition;
  viewportPosition: EquationViewportPosition;
};
