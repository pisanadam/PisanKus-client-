package net.kdt.pojavlaunch;

/**
 * The launcher's own packs, as lists rather than as files.
 *
 * Neither of these is a Modrinth project or an .mrpack. They are lists we
 * curate, resolved against Modrinth at install time, so a pack written today
 * still works on a Minecraft version that did not exist when it was written.
 *
 * Kept in step with the desktop launcher's `src/shared/curatedPack.ts` — same
 * packs, same order, so the two products install the same thing.
 */
public class PisanKusPacks {

    public static class Mod {
        public final String slug;
        public final String name;
        /** A pack without this mod is not worth installing. */
        public final boolean essential;

        Mod(String slug, String name, boolean essential) {
            this.slug = slug;
            this.name = name;
            this.essential = essential;
        }
    }

    public static class Pack {
        public final String id;
        public final String name;
        /** Modrinth's loader tag, and the loader the profile is created with. */
        public final String loader;
        /** The version the pack is built around; others stay selectable. */
        public final String defaultVersion;
        public final Mod[] mods;

        Pack(String id, String name, String loader, String defaultVersion, Mod[] mods) {
            this.id = id;
            this.name = name;
            this.loader = loader;
            this.defaultVersion = defaultVersion;
            this.mods = mods;
        }

        /** Where this pack's profile keeps its files, relative to the game home. */
        public String gameDirFor(String gameVersion) {
            return "./custom_instances/" + id.replace('-', '_') + "_"
                    + gameVersion.replaceAll("[^A-Za-z0-9._-]", "_");
        }
    }

    private static Mod mod(String slug, String name) {
        return new Mod(slug, name, false);
    }

    private static Mod essential(String slug, String name) {
        return new Mod(slug, name, true);
    }

    /**
     * Performance first: the pack that makes the game run, not the pack that
     * changes it. Fabric, because that is where these mods live.
     *
     * Ordered by what depends on what — libraries first, so a later mod finds
     * its dependency already present.
     */
    public static final Pack PISAN_OPTIMIZED = new Pack(
            "pisan-optimized", "Pisan Optimized", "fabric", "26.2", new Mod[]{
            essential("fabric-api", "Fabric API"),
            mod("fabric-language-kotlin", "Fabric Language Kotlin"),
            mod("cloth-config", "Cloth Config"),
            mod("yacl", "YetAnotherConfigLib"),
            mod("placeholder-api", "Placeholder API"),
            essential("sodium", "Sodium"),
            // Android only. Sodium refuses to start on this launcher — it
            // detects it by name and throws — and Podium is the mixin that
            // removes the check. Not essential: it only exists for 1.20.1 and
            // newer, and the older Sodium builds predate the check.
            mod("podium", "Podium"),
            mod("lithium", "Lithium"),
            mod("ferrite-core", "FerriteCore"),
            mod("immediatelyfast", "ImmediatelyFast"),
            mod("entityculling", "Entity Culling"),
            mod("moreculling", "More Culling"),
            mod("sodium-extra", "Sodium Extra"),
            mod("krypton", "Krypton"),
            mod("c2me-fabric", "C2ME"),
            mod("vmp-fabric", "Very Many Players"),
            mod("scalablelux", "ScalableLux"),
            mod("threadtweak", "ThreadTweak"),
            mod("dynamic-fps", "Dynamic FPS"),
            mod("fastquit", "FastQuit"),
            mod("modernfix", "ModernFix"),
            mod("noisium", "Noisium"),
            mod("bobby", "Bobby"),
            mod("modmenu", "Mod Menu"),
            mod("reeses-sodium-options", "Reese's Sodium Options"),
            mod("zoomify", "Zoomify"),
            mod("appleskin", "AppleSkin"),
            mod("mouse-tweaks", "Mouse Tweaks"),
            mod("3dskinlayers", "3D Skin Layers"),
            mod("no-chat-reports", "No Chat Reports"),
            mod("simple-voice-chat", "Simple Voice Chat"),
            mod("controlify", "Controlify")
    });

    /**
     * The big adventure pack: biomes, animals, food, dungeons, furniture.
     *
     * Forge and 1.20.1 on purpose — nearly every mod in it is published for
     * Forge, and 1.20.1 is the version 86 of the 90 have a build for. Pieces the
     * original poster names but Modrinth does not carry (the first Twilight
     * Forest, MrCrayfish's Furniture Mod and Framework, and a few smaller ones)
     * are simply not here: better an honest 90 than a list that reports
     * failures on every run.
     */
    public static final Pack SWEETIE = new Pack(
            "sweetie-pack", "Sweetie Pack", "forge", "1.20.1", new Mod[]{
            // Dünya üretimi ve keşif
            mod("tectonic", "Tectonic"),
            mod("biomes-o-plenty", "Biomes O' Plenty"),
            mod("the-twilight-forest-dungeons-villages", "Twilight Forest - Dungeons & Villages"),
            mod("when-dungeons-arise", "When Dungeons Arise"),
            mod("lithostitched", "Lithostitched"),
            mod("terrablender", "TerraBlender"),
            mod("chunky", "Chunky"),
            mod("regions-unexplored", "Regions Unexplored"),
            mod("aures-farmers-structures", "Farmer's Structures"),
            mod("the-graveyard-forge", "The Graveyard"),
            mod("alexs-caves", "Alex's Caves"),

            // Hayvanlar ve yaratıklar
            mod("alexs-mobs", "Alex's Mobs"),
            mod("alexs-mobs-naturalist-compat", "Alex's Mobs - Naturalist Compat"),
            mod("naturalist", "Naturalist"),
            mod("inhabitants", "Inhabitants"),
            mod("ecologics", "Ecologics"),
            mod("ribbits", "Ribbits"),
            mod("guard-ribbits", "Guard Ribbits"),
            mod("useful-ribbits", "Useful Ribbits"),
            mod("faunify", "Faunify"),
            mod("dragns-bettas-aquatics", "Dragn's Bettas & Aquatics"),
            mod("whisperwoods", "Whisperwoods"),
            mod("zombie-awareness", "Zombie Awareness"),
            mod("doggy-talents-next", "Doggy Talents Next"),
            mod("callable-horses", "Callable Horses"),

            // Tarım, yemek ve pişirme
            essential("farmers-delight", "Farmer's Delight"),
            mod("farmers-respite", "Farmer's Respite"),
            mod("oceans-delight", "Ocean's Delight"),
            mod("naturalist-delight", "Naturalist Delight"),
            mod("aquaculture", "Aquaculture 2"),
            mod("aquaculture-delight", "Aquaculture Delight"),
            mod("large-meals", "Large Meals"),
            mod("incubation", "Incubation"),

            // Dövüş ve ilerleme
            mod("better-combat", "Better Combat"),
            mod("apotheosis", "Apotheosis"),
            mod("apothic-attributes", "Apothic Attributes"),
            mod("age-of-weapons-reforged", "Age of Weapons"),
            mod("darkquesting", "DarkQuesting"),
            mod("luminous-beasts", "LUMINOUS: BEASTS"),
            mod("yungs-better-dungeons", "YUNG's Better Dungeons"),
            mod("yungs-better-jungle-temples", "YUNG's Better Jungle Temples"),

            // Yapı, mobilya ve dekorasyon
            mod("amendments", "Amendments"),
            mod("supplementaries", "Supplementaries"),
            mod("rustic-engineer", "Rustic Engineer"),

            // Harita ve yön bulma
            mod("xaeros-world-map", "Xaero's World Map"),
            mod("xaeros-minimap", "Xaero's Minimap"),

            // Envanter, arayüz ve konfor
            mod("travelersbackpack", "Traveler's Backpack"),
            essential("jei", "Just Enough Items"),
            mod("inventory-profiles-next", "Inventory Profiles Next"),
            mod("inventory-hud+-by-soulspeed", "Inventory HUD+"),
            mod("mouse-tweaks", "Mouse Tweaks"),
            mod("jade", "Jade"),
            mod("jade-addons-forge", "Jade Addons"),
            mod("appleskin", "AppleSkin"),
            mod("configured", "Configured"),
            mod("polymorph", "Polymorph"),
            mod("gravestone-mod", "Gravestone Mod"),
            mod("gravestone-x-curios-api-compat", "Gravestone x Curios"),
            mod("patchouli", "Patchouli"),
            mod("tree-harvester", "Tree Harvester"),

            // Görsellik ve animasyon
            mod("oculus", "Oculus"),
            mod("embeddium", "Embeddium"),
            mod("playeranimator", "playerAnimator"),
            mod("not-enough-animations", "Not Enough Animations"),
            mod("3dskinlayers", "3D Skin Layers"),
            mod("pretty-rain", "Pretty Rain"),
            mod("vminus", "VMinus"),

            // Performans
            mod("modernfix", "ModernFix"),
            mod("ai-improvements", "AI Improvements"),
            mod("ferrite-core", "FerriteCore"),
            mod("libipn", "libIPN"),

            // Kütüphaneler
            mod("blueprint", "Blueprint"),
            mod("placebo", "Placebo"),
            mod("coroutil", "CoroUtil"),
            mod("glitchcore", "GlitchCore"),
            mod("cristel-lib", "Cristel Lib"),
            mod("collective", "Collective"),
            mod("architectury-api", "Architectury API"),
            mod("moonlight", "Moonlight Lib"),
            mod("caelus", "Caelus API"),
            mod("kotlin-for-forge", "Kotlin for Forge"),
            mod("cloth-config", "Cloth Config API"),
            mod("citadel", "Citadel"),
            mod("curios", "Curios API"),
            mod("yungs-api", "YUNG's API"),
            mod("baguettelib", "BaguetteLib"),

            // Doku paketleri
            mod("better-dogs-x-doggy-talents-next!", "Better Dogs X Doggy Talents Next"),
            mod("realistic-mobs-new", "Realistic Mobs"),
            mod("better-farm-animals", "Better Farm Animals"),
            mod("better-dogs", "Better Dogs")
    });

    public static final Pack[] ALL = {PISAN_OPTIMIZED, SWEETIE};

    public static Pack byId(String id) {
        for (Pack pack : ALL) {
            if (pack.id.equals(id)) return pack;
        }
        return PISAN_OPTIMIZED;
    }
}
