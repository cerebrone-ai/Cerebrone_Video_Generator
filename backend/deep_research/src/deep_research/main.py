#!/usr/bin/env python
from random import randint
from pydantic import BaseModel

from crewai.flow import Flow, listen, start, router

from deep_research.src.deep_research.crews.planner_crew.planner_crew import PlannerCrew
from deep_research.src.deep_research.crews.researcher_crew.researcher_crew import ResearcherCrew
from typing import Optional

class ResearchState(BaseModel):
    description: str = ""
    context: str = ""
    #feedback: Optional[str] = ""    
    #retry_count:int = 0
    #valid: bool = False 
    content: str = ""

class DeepResearchFlow(Flow[ResearchState]):
    def __init__(self, description: str):
        super().__init__()
        self.state.description = description
    @start()
    def generate_plan(self):
        print("Plan Generator")
        self.state.context = "This is a video description which needs to be refined for video generation: "
        self.state.description = self.state.context + self.state.description
        response = PlannerCrew().crew().kickoff(inputs = {"description":self.state.description})
        print("First Draft of Research:", self.state.content)
        self.state.content = response.raw
        
    @listen(generate_plan)
    def section_research(self):
        response = ResearcherCrew().crew().kickoff(inputs = {"content":self.state.content})
        self.state.content = response.raw
        print(f'Final Draft: {self.state.content}')
        return self.state.content
    """
    @listen("approved")
    def save_result(self):
        print("Saving poem")       
        pass

    @listen("max_retry_exceeded")
    def max_retry_exceeded_exit():
        exit()
        pass
    
    """

def kickoff(description: str):
    flow = DeepResearchFlow(description)
    flow.kickoff()
    return flow.state.content
