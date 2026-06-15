"use client";

import * as React from "react";
import { Ellipsis } from "lucide-react";

type HomeTaskCardProps = {
  completed: number;
  description: string;
  icon: React.ReactNode;
  title: string;
  total: number;
};

function renderMeterSegments(completed: number, total: number) {
  return Array.from({ length: total }, (_, index) => (
    <span
      className={`home-task-card__meter-segment ${
        index < completed ? "home-task-card__meter-segment--active" : ""
      }`}
      key={`${completed}-${total}-${index}`}
    />
  ));
}

export function HomeTaskCard({
  completed,
  description,
  icon,
  title,
  total,
}: HomeTaskCardProps) {
  return (
    <article className="home-task-card">
      <div className="home-task-card__leading">
        <div className="home-task-card__icon" aria-hidden="true">
          {icon}
        </div>

        <div className="home-task-card__copy">
          <h3 className="home-task-card__title">{title}</h3>
          <p className="home-task-card__description">{description}</p>
        </div>
      </div>

      <div className="home-task-card__trailing">
        <p className="home-task-card__metric">
          {completed}/{total}
        </p>

        <div className="home-task-card__meter" aria-hidden="true">
          {renderMeterSegments(completed, total)}
        </div>

        <button className="home-task-card__more" type="button">
          <Ellipsis className="size-4" />
        </button>
      </div>
    </article>
  );
}
