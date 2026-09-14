# Resource Dice

I got tired of counting arrows.

You know the drill: you're mid-fight, you fire off a couple shots, and now you're supposed to remember whether you've got 14 arrows left or 12. Nobody actually tracks that. So this little module lets you handle consumables the lazy way, with a shrinking die instead of exact numbers.

If you've ever used the "usage die" idea from The Black Hack (or Angry GM's resource dice), that's the whole thing. Your quiver is a d8. You shoot, you roll it. Roll a 1 or 2 and the die steps down to a d6. Keep going and eventually it's a d4, and then you're out. No math, just vibes.

## What it does

Adds a **Resources** box to the front page of any D&D 5e character sheet, tucked right under Hit Points and Hit Dice in the sidebar. Hit the little **+** and you get a new track. Each one has:

- A name field. Put whatever you want in there. Arrows, torches, oil flasks, rations, spell components, sanity, snacks. It's just text.
- A die picker (d20 down to d4, plus 0 for "empty").
- **+ / −** buttons to bump the die up or down by hand if you need to.
- A roll button. Rolls the current die to chat.

Roll a 1 or a 2 and the die automatically drops a size. When there's nothing left it lands on 0 and the roll button greys out. Refill it by picking a bigger die again.

## Installing it

There's no fancy install link yet, so do it by hand:

1. Drop the `resource-dice` folder into your Foundry `Data/modules/` directory.
2. Fire up your world, go to **Manage Modules**, and switch it on.
3. Open a character sheet and look under Hit Dice.

That's it. It only touches D&D 5e character sheets and it stores its data right on the actor, so nothing weird happens to the rest of your game.

## Good to know

- Anyone who owns the character can add, edit, and roll their resources. Other players just see the tracks and can roll them, but can't mess with the setup.
- All the data lives in the character's flags. If you ever remove the module, your characters are fine, they just lose the resource boxes.
- Built for Foundry v13/v14 and the D&D 5e system (v6+). If you're on something older, it might not play nice.

## Made for

Foundry VTT running the official Dungeons & Dragons Fifth Edition system. Nothing in the system itself gets modified, this just rides along on top of the sheet.

Have fun, and stop counting your arrows.
