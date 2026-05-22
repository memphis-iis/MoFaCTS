# AutoTutor Implementation Questions

Use this file to add decisions inline before implementation. Each question has an `Answer:` slot for notes, constraints, or final decisions.

## Content Model

1. Should one stimulus `stim` contain exactly one AutoTutor script, or should the script live at the cluster level so all `stims` in the cluster can share it?

   Answer:No, I think what we want to do is I think it should be the first stimulus in each cluster. Right now I have no plans to use multiple stimuli per cluster, but if you look at how the other files are structured, usually we have them, the individual stimuli, at the cluster level in a stimulus grouping. 

2. Do we want the AutoTutor structured content field to be named `autotutor`, `autoTutor`, `autoTutorSession`, or something more general like `tutoringScript`?

   Answer:I think the camel case second option is good, or, no, do you mean the tag for the unit name? We want to call it AutoTutor session. Following the convention of the other session types, we would have no capitals. 

3. Should `idealAnswer` remain in the AutoTutor script, or should it also be mirrored in the normal `response.correctResponse` field for compatibility with existing content tooling?

   Answer: No, there should be no compatibility with existing content tooling at all. The AutoTutor setup is completely different than the existing content tooling. This is a new modular unit type. It could be interleaved with other unit types, but not with the same content. 

4. Should AutoTutor content be allowed to include HTML/Markdown, or should all structured script text be plain text?

   Answer:Well, since it's going to be passed to an AI, it's probably better to sanitize it to save tokens or have it clean to start with and just be plain text. 

5. Is the initial schema meant to be narrowly tied to expectation/misconception tutoring, or should we leave room for other tutoring strategies later?

   Answer:Yes, we want to stick with the AutoTutor strategy and not go beyond it. Did you read the paper I gave you? 

## TDF Wiring

6. Should `openRouterModel` be lesson-level only in `setspec`, or should individual AutoTutor units be allowed to override it?

   Answer:Oh, I guess it would be nice to have it be in the individual units to override, because then we could compare models. 

7. Should `openRouterApiKey` live in the TDF permanently, or is that just the first implementation path before moving to teacher/user/server-stored keys?

   Answer:Yeah, that's going to live in the TDF permanently, and we're going to have to modify our mofacts_config strip script to strip it and put it back in, like we do for the Google TTS and SR keys. 

8. Should AutoTutor unit config be only `{ "cluster": 0 }`, or do we need unit-level runtime options like max turns, completion threshold, or transcript visibility?

   Answer: Let's just get it running first and have it time out after 20 turns. Unless, of course, all the expectations are met and misconceptions are no longer apparently part of the students' understanding 

9. Should AutoTutor units support instructions before the chat using existing `unitinstructions`, or should the chat prompt itself be considered enough?

   Answer: No

## LLM Protocol

10. Should the LLM do both evaluation and tutor utterance generation in one call, or should we split it into two calls: evaluator/controller first, tutor wording second?

    Answer:I think probably both because they are coherent in joint context. 

11. Do we require strict JSON schema output from OpenRouter for every turn?

    Answer:No, we do not. We're going to allow Open Router to freely speak to the student at this point. We will think about sanitizing AutoTutor's results later. 

12. Should we disallow OpenRouter model/provider fallback entirely so unsupported models fail clearly?

    Answer:Well, fall backs aren't generally allowed, so that should fail. 

13. What TDF fields should authors control now: `temperature`, `max_tokens`, provider routing, system prompt style, max turns?

    Answer:Let's just use the default settings right now, but we did talk about having max 20 turns unless they meet the criteria. 

14. Should the system prompt be app-owned, content-owned, or partly content-owned?

    Answer:What is this question asking? 

15. Should we send the full conversation history every turn, or a compact tutor state plus recent turns?

    Answer:I would like each turn to modify a state object. That state object is going to mark whether a student currently has an expectation or a misconception in their statement. That state object then will list all the expectations and misconceptions and track when each one is stated or not. Of course, if the misconceptions are stated, then there needs to be the resolving of that. If the expectations are stated, they're just going to mark in the thing, and this is how this state object then is going to be how we decide whether the criteria is met, like three out of four expectations or something. So we will use the stimulus list of expectations and misconceptions, and each turn we will grade the response on that, which will allow us to derive the next turn's move. 

## Tutor State

16. What is the canonical saved state after each turn?

    Possible fields: covered expectation IDs, active misconception IDs, answer quality, selected move, turn count, dialogue summary, completion status, last tutor utterance, model, and provider metadata.

    Answer: We don't need the dialogue summary. I think producing that is going to add more overhead, and I'm not sure we need it yet. The other stuff is good, and we can put that in the data file that we write for each turn, because we'll be writing one row in the data download outputs, one history record of some sort. 

17. Should “student asked a question” be a first-class detected state separate from answer quality?

    Answer: Yeah, we could detect that, and if it's not asking for a direct response, a direct answer, we could give hints. 

18. Should completion be decided by the LLM, by deterministic controller logic over returned coverage, or both?

    Answer: Well, as I say, it should be expectations minus misconceptions, and there'll be some sort of score for graduation for each stimulus. 

19. Do we want a hard max-turn rule for phase 1 to prevent runaway sessions?

    Answer: Yes, I suggested that earlier, twenty. 

20. Should “repeated failure” be counted per expectation, per misconception, or globally?

    Answer: No, at this point we don't need a score that could be described with a model from the history, but we're not going to do that right now. We're just going to track whether each expectation is considered to be current. In other words, whenever it is stated, it becomes current, and then also for the misconceptions, if they're stated, they become current. If they are rescinded or the student repairs their misconception, then The misconception is removed because the current state is no misconception. 

## Persistence

21. Where should the transcript live: existing history records, experiment state, or a new AutoTutor-specific collection?

    Answer:For each history record, let's include the AI's prompt and the student's response. 

22. What needs to survive refresh/resume: full transcript, compact tutor state, or both?

    Answer: Let's just restore the compact tutor state and not worry about the full transcript. The compact tutor state should explain and should allow moves to be chosen to complete. 

23. What should instructor/reporting exports show: every chat turn, only final mastery state, or both?

    Answer: The only reporting that we're going to have right now is the data download. 

24. Should model request/response payloads be saved for audit/debugging, or only the distilled tutor state?

    Answer: The model request and response payloads are definitely safe because they are put in the history. 

25. How do we prevent the OpenRouter key from ever appearing in client-visible TDF content after upload?

    Answer: Same methodology we used for the Google API key. 

## Security And Cost

26. Should only logged-in users be allowed to run AutoTutor calls, or can public/no-login experiment users use them too?

    Answer: If they have appropriate access to the TDF that contains it, then they can use it. 

27. What rate limit do we want per user/session?

    Answer:If we can meet our usage, we should not allow anybody to do more than 20 cents. Except for the admin. 

28. Should we check key balance/validity with `GET /api/v1/key` during upload/config validation, or only fail on first tutor call?

    Answer:I think we only fail on the first tutor call. Though we should fail clearly for the user so they know that they need to go back and fix the key. 

29. Should the server redact learner names or identifiers from OpenRouter payloads, sending only stable anonymous IDs?

    Answer: Yes. 

30. Do we need a per-session cost ceiling or max-turn ceiling before launch?

    Answer: Twenty cents. 

## UI

31. Should AutoTutor appear inside the existing card surface, or should it have a distinct Svelte chat mode?

    Answer:Now, here I think we really need to use the right chat package. I don't think we should build a chat interface ourselves. I think we should find something open source that's pretty nice and use that, and that will end up determining how we have to use it. 

32. Should the learner see the original question pinned above the chat throughout the session?

    Answer:That's a great idea. Let's do that. 

33. Is the learner allowed to submit empty/short “I don’t know” turns, or should the UI require substantive input?

    Answer:Yes, I believe that there's a response that the AutoTutor is supposed to give for such student answers. 

34. Should there be a visible “finish” button, or only controller-driven completion?

    Answer:No finish button right now, but I think it would be great to co-opt the performance metric bar on the top of the screen. The percent correct could represent the percentage of the autotutor problem that was successfully answered. If there's four expectations and three misconceptions, the best you could do is four zero, so it would be whatever out of four. It would be capped at zero at the minimum if they had misconceptions and no expectations. If they had three out of four expectations, it would show 75%. 

35. Should tutor errors be shown as technical errors, learner-friendly messages, or both depending on role?

    Answer:Well, we are only going to have the errors for the build and construction time. We should be able to get all the errors out, so learners aren't going to see them. 

## Testing

36. Should we build a fake OpenRouter server/mock first so most tests do not require a real key?

    Answer:Oh no, that's no big deal. We can just keep the usage capped, and I can make sure I don't put too much in my account so we get cut off before $5 is spent. 

37. What should the first manual test prove: successful happy path, misconception correction, resume after refresh, or all three?

    Answer:Well, we should be able to do the AutoTutor cycle successfully. I'm less concerned with the resume after refresh. We could wait for the resume until later, I guess. Better not to have it resume something that's broken. 

38. Do we need a deterministic test model setting, or should tests only verify payload construction and response handling with mocked responses?

    Answer: You could create a file that simplifies testing the algorithm, and also, of course, we'll be able to use the MCP server where we have the hot fixes. You can check the progress as you go along at any time that it makes sense. Use localhost 3200 for hotfix verification. Local test credentials were supplied separately and should not be committed in this repo document.

## Follow-Up Questions

39. For the stimulus content field, should we settle on `autoTutor` for the structured script while keeping the TDF unit tag `autotutorsession` all lowercase?

    Answer: Yes. Use `autoTutor` for the structured stimulus script and `autotutorsession` for the lowercase TDF unit tag.

40. If OpenRouter is allowed to freely speak to the student and we do not require strict JSON output, how should the server reliably update the tutor state after each turn?

    Possible choices:
    - Ask the same model for a lightly structured envelope but do not enforce OpenRouter JSON schema.
    - Make a second hidden evaluation call that updates state, while the first call produces the tutor utterance.
    - Let the model produce the tutor utterance only, then use deterministic/local heuristics for state updates.

    Answer: The model must reply with a JSON summary of expectations/misconceptions plus what to say to the student. We will include the JSON schema in the prompt. OpenRouter-enforced structured output is not required for phase 1.

41. What is the authored graduation threshold shape? Is it `requiredExpectations` plus zero active misconceptions, a numeric threshold such as three out of four expectations, or both?

    Answer: Use an authored threshold in the unit TDF. Add a tag under `autotutorsession` for the graduation rule.

42. How should the 20-cent session ceiling be calculated in phase 1: estimate locally from token counts and configured model pricing, or query/track OpenRouter usage metadata if available in responses?

    Answer: Keep it simple for phase 1. Stop once tracked cost exceeds 20 cents.

43. Which chat package should be the first implementation target?

    Answer: Use `deep-chat`. It is MIT-licensed, focused on AI chat, and can be used as a web component. Flowbite Svelte or Bits UI can be fallback building blocks for surrounding controls if needed.

44. What model should the example use first?

    Answer: Try an OpenAI 4.1 model through OpenRouter first.
