LOCAL_PATH := $(call my-dir)

$(call inherit-product, $(SRC_TARGET_DIR)/product/aosp_x86_64.mk)

PRODUCT_NAME := movieroom_x86_64
PRODUCT_DEVICE := generic_x86_64
PRODUCT_BRAND := TaylorMade Movies
PRODUCT_MODEL := Movie Room OS Emulator
PRODUCT_MANUFACTURER := TaylorMade Movies

PRODUCT_SYSTEM_PROPERTIES += \
    ro.movieroom.product=MovieRoomOS \
    ro.movieroom.release=0.1.0-prototype

# Install the native launcher into the product. The Android Studio application
# id and the AOSP manifest package are the same stable home contract.
PRODUCT_PACKAGES += \
    MovieRoomShell

PRODUCT_PACKAGE_OVERLAYS += \
    $(LOCAL_PATH)/overlay
