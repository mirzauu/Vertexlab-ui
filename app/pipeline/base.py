"""
Pipeline base classes: PipelineContext and BasePipelineStep.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional
from uuid import UUID


@dataclass
class PipelineContext:
    """
    Shared context passed between pipeline steps.
    Each step reads from and writes to this context.
    """
    task_id: UUID
    organization_id: UUID

    # File paths (populated during pipeline setup)
    audio_file_path: Optional[str] = None
    raw_data_file_paths: list[str] = field(default_factory=list)

    # Intermediate results (populated by steps)
    transcript: Optional[dict] = None          # STT output
    processed_data: Optional[dict] = None      # Data processing output
    analysis_result: Optional[dict] = None     # Analysis output
    matching_result: Optional[dict] = None     # Matching output
    generated_document: Optional[dict] = None  # Document generation output

    # Metadata
    metadata: dict = field(default_factory=dict)
    
    # Database Session
    db: Any = None


class BasePipelineStep(ABC):
    """
    Abstract base class for pipeline steps.
    Each step must implement the `execute` method.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """The unique name of this step (matches pipeline_steps.step_name)."""
        ...

    @abstractmethod
    async def execute(self, context: PipelineContext) -> PipelineContext:
        """
        Execute this step.

        Args:
            context: Shared pipeline context with inputs and intermediate results.

        Returns:
            Updated pipeline context with this step's outputs.
        """
        ...
