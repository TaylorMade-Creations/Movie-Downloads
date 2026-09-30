$(call inherit-product, $(SRC_TARGET_DIR)/product/aosp_x86_64.mk)

PRODUCT_NAME := movieroom_x86_64
PRODUCT_DEVICE := generic_x86_64
PRODUCT_BRAND := TaylorMade Movies
PRODUCT_MODEL := Movie Room OS Emulator
PRODUCT_MANUFACTURER := TaylorMade Movies

PRODUCT_SYSTEM_PROPERTIES += \
    ro.movieroom.product=MovieRoomOS \
    ro.movieroom.release=0.1.0-prototype

# The launcher module is supplied by the Movie Room AOSP integration step.
# The Android Studio module's application id is the stable home contract.
PRODUCT_PACKAGE_OVERLAYS += \
    device/movieroom/emulator/overlay
